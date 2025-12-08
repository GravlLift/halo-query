import type { LeaderboardEntry } from '@gravllift/halo-helpers';
import { ConstantBackoff, handleWhen, retry } from 'cockatiel';
import {
  BehaviorSubject,
  Subject,
  bufferTime,
  filter,
  firstValueFrom,
  map,
} from 'rxjs';
import {
  ActionProgress,
  ActionReceiver,
  ActionSender,
  BaseRoomConfig,
  DataPayload,
  RelayConfig,
  Room,
  joinRoom,
  selfId,
} from 'trystero';
import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { appInsights } from '../application-insights/client';

type RoomLeaderboard = {
  room: Room;
  leaderboardProvider: ILeaderboardProvider;
};
let roomLeaderboard: RoomLeaderboard | undefined;

function reconnect() {
  if (roomLeaderboard) {
    const { leaderboardProvider } = roomLeaderboard;
    roomLeaderboard.room.leave();
    roomLeaderboard = undefined;
    ensureJoin(leaderboardProvider);
  } else {
    console.error('No room to reconnect to');
  }
}

let sendCsrEntriesAction: PrettyAction<LeaderboardEntry[]>;
let requestEntriesAction: PrettyAction<null>;
const reconnectPolicy = retry(
  handleWhen(
    (e) =>
      e.name === 'InvalidStateError' || e.message.includes('InvalidStateError')
  ),
  {
    maxAttempts: 2,
  }
);
reconnectPolicy.onFailure(({ handled }) => {
  if (handled) {
    reconnect();
  }
});

setInterval(() => {
  if (
    roomLeaderboard &&
    Object.keys(roomLeaderboard.room.getPeers()).length === 0
  ) {
    reconnect();
  }
}, 60000);

interface PrettyAction<T> {
  send: ActionSender<T>;
  onReceive: ActionReceiver<T>;
  onProgress: ActionProgress;
}

function makePrettyAction<TData extends DataPayload>(
  room: Room,
  namespace: string
): PrettyAction<TData> {
  const action = room.makeAction<TData>(namespace);
  return {
    send: action[0],
    onReceive: action[1],
    onProgress: action[2],
  };
}

const _peerStatus$ = new BehaviorSubject<Record<string, number | null>>({});
export const peerStatus$ = _peerStatus$.asObservable();
export { selfId };

const requestEntriesCalls = new Set<string>();
const peerJoined$ = new Subject<string>();

export function ensureJoin(leaderboard: ILeaderboardProvider) {
  try {
    roomLeaderboard = {
      room: joinRoom(
        {
          appId: 'halo-query',
          rtcPolyfill: class FixedRTCPeerConnection extends RTCPeerConnection {
            override close(): void {
              super.close();
              queueMicrotask(() => {
                if (document) {
                  let img: HTMLImageElement | null =
                    document.createElement('img');
                  img.src = window.URL.createObjectURL(
                    new Blob([new ArrayBuffer(5e7)])
                  ); // 50Mo or less or more depending as you wish to force/invoke GC cycle run
                  img.onerror = function () {
                    window.URL.revokeObjectURL(this.src);
                    img = null;
                  };
                }
              });
            }
          },
        } as BaseRoomConfig & RelayConfig,
        'leaderboard-2'
      ),
      leaderboardProvider: leaderboard,
    };
    sendCsrEntriesAction = makePrettyAction<LeaderboardEntry[]>(
      roomLeaderboard.room,
      'sendCsrs'
    );
    requestEntriesAction = makePrettyAction<null>(
      roomLeaderboard.room,
      'request'
    );

    peerJoined$.pipe(bufferTime(2000)).subscribe((newPeers) => {
      for (const peerId of newPeers) {
        // Roll a random number to determine if we should send all csr entries,
        // such that the expected number of senders is 4
        if (
          roomLeaderboard &&
          Math.random() <
            4 / Math.max(1, Object.keys(roomLeaderboard.room.getPeers()).length)
        ) {
          // Don't await
          leaderboard
            .getAllEntries()
            .then((buffer) => sendEntriesToPeer(buffer, peerId))
            .catch((e) => {
              if (e instanceof Error) {
                appInsights.trackException({
                  exception: e,
                });
              } else {
                console.error(e);
              }
            });
        }
      }
    });
    roomLeaderboard.room.onPeerJoin(async (peerId) => {
      _peerStatus$.next({ ..._peerStatus$.value, [peerId]: null });
      peerJoined$.next(peerId);
    });
    roomLeaderboard.room.onPeerLeave((peerId) => {
      const { [peerId]: _, ...rest } = _peerStatus$.value;
      _peerStatus$.next(rest);
    });

    sendCsrEntriesAction.onProgress((percent, peerId) => {
      _peerStatus$.next({ ..._peerStatus$.value, [peerId]: percent });
    });
    sendCsrEntriesAction.onReceive((data, peerId) => {
      _peerStatus$.next({ ..._peerStatus$.value, [peerId]: null });
      leaderboard.addLeaderboardEntries(data);
    });

    requestEntriesAction.onReceive(async (_, peerId) => {
      if (requestEntriesCalls.has(peerId)) {
        return;
      }
      requestEntriesCalls.add(peerId);

      try {
        const buffer: LeaderboardEntry[] = await leaderboard.getAllEntries();
        await sendEntriesToPeer(buffer, peerId).finally(() => {
          requestEntriesCalls.delete(peerId);
        });
      } catch (e) {
        if (e instanceof Error) {
          appInsights.trackException({
            exception: e,
          });
        } else {
          console.error(e);
        }
      }
    });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message ===
        "Failed to construct 'RTCPeerConnection': Cannot create so many PeerConnections" ||
        (e instanceof AggregateError &&
          e.errors.some(
            (err) =>
              err.message ===
              "Failed to construct 'RTCPeerConnection': Cannot create so many PeerConnections"
          )))
    ) {
      return;
    }
    throw e;
  }
}

export function leave() {
  if (roomLeaderboard) {
    roomLeaderboard.room.leave();
    roomLeaderboard = undefined;
  }
}

// Don't send duplicate data to the same peer
const sendQueue = new Map<
  string,
  { entries: LeaderboardEntry[]; promise: Promise<void> }[]
>();
async function _sendEntriesToPeer(entries: LeaderboardEntry[], peerId: string) {
  await reconnectPolicy.execute(() =>
    sendCsrEntriesAction.send(entries, peerId)
  );
}

async function sendEntriesToPeer(
  entries: LeaderboardEntry[],
  peerId: string
): Promise<void> {
  const peerRequestsInProcess = sendQueue.get(peerId) ?? [];

  for (const { entries: queueEntries, promise } of peerRequestsInProcess) {
    if (
      queueEntries.length === entries.length &&
      queueEntries.every((entry, i) => entry.matchId === entries[i].matchId)
    ) {
      return promise;
    }
  }

  const promise = _sendEntriesToPeer(entries, peerId);
  promise.finally(() => {
    if (peerRequestsInProcess.length === 1) {
      sendQueue.delete(peerId);
    } else {
      const idx = peerRequestsInProcess.findIndex(
        (qe) => qe.promise === promise
      );
      peerRequestsInProcess.splice(idx, 1);
    }
  });
  peerRequestsInProcess.push({ entries, promise });
  sendQueue.set(peerId, peerRequestsInProcess);

  return promise;
}

const sendEntriesToAllSubject$ = new Subject<LeaderboardEntry[]>();
sendEntriesToAllSubject$
  .pipe(
    bufferTime(2000),
    map((e) => e.flat()),
    filter((e) => e.length > 0)
  )
  .subscribe((entries) => {
    if (!roomLeaderboard) {
      return;
    }

    for (const peerId of Object.keys(roomLeaderboard.room.getPeers())) {
      sendEntriesToPeer(entries, peerId);
    }
  });

export const sendLeaderboardEntriesToAllPeers = (data: LeaderboardEntry[]) => {
  sendEntriesToAllSubject$.next(data);
};

export const requestEntries = async () => {
  if (!roomLeaderboard) {
    return;
  }

  // Choose 4 peers at random and request
  let peers = Object.keys(roomLeaderboard.room.getPeers());
  let chosenPeers: Set<string>;
  if (peers.length <= 4) {
    chosenPeers = new Set(peers);
  } else {
    chosenPeers = new Set();
    while (chosenPeers.size < 4) {
      const randomIndex = Math.floor(Math.random() * peers.length);
      chosenPeers.add(peers[randomIndex]);
      peers = peers.splice(randomIndex, 1);
    }
  }
  for (let i = 0; i < 4; i++) {
    if (i > chosenPeers.size - 1 && roomLeaderboard) {
      // Not enough chosen peers, recheck for new peers
      let newPeers = Object.keys(roomLeaderboard.room.getPeers()).filter(
        (peer) => !chosenPeers.has(peer)
      );
      if (newPeers.length === 0) {
        // Wait for another peer to connect.
        newPeers = await firstValueFrom(
          _peerStatus$.pipe(
            map((peers) =>
              Object.keys(peers)
                .filter((peer) => !chosenPeers.has(peer))
                .slice(0, 4)
            ),
            filter((np) => np.length > 0)
          )
        );
        newPeers.forEach((peer) => chosenPeers.add(peer));
      }
    }

    const peerId = chosenPeers.values().next();
    // Don't await
    reconnectPolicy.execute(() =>
      requestEntriesAction.send(null, peerId.value)
    );
  }
};

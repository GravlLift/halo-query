import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { SeverityLevel } from '@microsoft/applicationinsights-web';
import Dexie from 'dexie';
import { Context, ReactNode, useEffect, useMemo, useRef } from 'react';
import { Observable, Subject } from 'rxjs';
import { appInsights } from '../../lib/application-insights/client';
import { LeaderboardEntry } from '../../lib/leaderboard';
import {
  ensureJoin,
  selfId,
  leave,
  peerStatus$,
  requestEntries,
  sendLeaderboardEntriesToAllPeers,
} from '@gravllift/halo-helpers/src/hive-mind';
import { HiveMindContext } from './hive-mind-context';
import { LeaderboardContext } from './leaderboard-context';
import { useLeaderboardProvider } from './non-worker-leaderboard';

export default function LeaderboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const leaderboard = useLeaderboardProvider();
  const newEntries$ = useMemo(() => new Subject<LeaderboardEntry[]>(), []);
  const leaderboardProvider = useMemo<
    ILeaderboardProvider & { newEntries$: Observable<LeaderboardEntry[]> }
  >(() => {
    // Preserve the proxy by using it as the prototype and overriding specific members.
    const base = leaderboard;
    const provider = Object.create(base) as ILeaderboardProvider & {
      newEntries$: Observable<LeaderboardEntry[]>;
    };

    provider.getPlaylistEntriesCount = async (playlistAssetId) => {
      const count = await base.getPlaylistEntriesCount(playlistAssetId);
      if (count === 0) {
        requestEntries();
      }
      return count;
    };

    provider.addLeaderboardEntries = async (entries) => {
      const entriesAdded = await base
        .addLeaderboardEntries(entries)
        .catch((err) => {
          if (err instanceof Dexie.DexieError) {
            appInsights.trackTrace({
              severityLevel: SeverityLevel.Warning,
              message: err.message,
            });
          } else {
            appInsights.trackException({
              exception: err,
            });
          }
          throw err;
        });

      if (entriesAdded.length) {
        newEntries$.next(entriesAdded);
        sendLeaderboardEntriesToAllPeers(entriesAdded);
      }
      return entriesAdded;
    };

    Object.defineProperty(provider, 'newEntries$', {
      value: newEntries$.asObservable(),
      enumerable: true,
      configurable: false,
      writable: false,
    });

    return provider;
  }, [leaderboard, newEntries$]);

  const hiveMindProvider = useRef<
    typeof HiveMindContext extends Context<infer T> ? T : never
  >({
    selfId,
    peerStatus$,
  });

  useEffect(() => {
    ensureJoin(
      leaderboardProvider,
      class FixedRTCPeerConnection extends RTCPeerConnection {
        override close(): void {
          super.close();
          queueMicrotask(() => {
            if (document) {
              let img: HTMLImageElement | null = document.createElement('img');
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
      }
    );
    return () => {
      leave();
    };
  }, [leaderboardProvider]);

  return (
    <LeaderboardContext.Provider value={leaderboardProvider}>
      <HiveMindContext.Provider value={hiveMindProvider.current}>
        {children}
      </HiveMindContext.Provider>
    </LeaderboardContext.Provider>
  );
}

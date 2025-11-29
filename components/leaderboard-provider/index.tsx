import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { SeverityLevel } from '@microsoft/applicationinsights-web';
import Dexie from 'dexie';
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Observable, Subject } from 'rxjs';
import { appInsights } from '../../lib/application-insights/client';
import { LeaderboardEntry } from '../../lib/leaderboard';
import {
  ensureJoin,
  selfId as hiveMindSelfId,
  leave,
  peerStatus$,
  requestEntries,
  sendLeaderboardEntriesToAllPeers,
} from '../../lib/leaderboard/hive-mind';
import { HiveMindContext, type useHiveMind } from './hive-mind-context';
import { LeaderboardContext } from './leaderboard-context';
import { useNonWorkerLeaderboard } from './non-worker-leaderboard';

export default function LeaderboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const leaderboard = useNonWorkerLeaderboard();
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

  const hiveMindProvider = useRef<ReturnType<typeof useHiveMind>>();

  useEffect(() => {
    ensureJoin(leaderboardProvider);
    hiveMindProvider.current = { selfId: hiveMindSelfId, peerStatus$ };
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

import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { SeverityLevel } from '@microsoft/applicationinsights-web';
import Dexie from 'dexie';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Observable, Subject } from 'rxjs';
import { appInsights } from '../../lib/application-insights/client';
import { LeaderboardEntry } from '../../lib/leaderboard';
import {
  ensureJoin,
  selfId as hiveMindSelfId,
  peerStatus$,
  requestEntries,
  sendLeaderboardEntriesToAllPeers,
  leave,
} from '../../lib/leaderboard/hive-mind';
import { HiveMindContext, type useHiveMind } from './hive-mind-context';
import { LeaderboardContext } from './leaderboard-context';
import { useWorkerLeaderboard } from './worker-leaderboard';

export default function LeaderboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const leaderboard = useWorkerLeaderboard();
  const newEntries$ = useMemo(() => new Subject<LeaderboardEntry[]>(), []);
  const leaderboardProvider = useMemo<
    ILeaderboardProvider & { newEntries$: Observable<LeaderboardEntry[]> }
  >(() => {
    return {
      ...leaderboard,
      async getPlaylistEntriesCount(playlistAssetId) {
        const count = await leaderboard.getPlaylistEntriesCount(
          playlistAssetId
        );
        if (count === 0) {
          requestEntries();
        }
        return count;
      },
      async addLeaderboardEntries(entries) {
        const entriesAdded = await leaderboard
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
      },
      newEntries$: newEntries$.asObservable(),
    };
  }, [leaderboard, newEntries$]);

  const [hiveMindProvider, setHiveMindProvider] =
    useState<ReturnType<typeof useHiveMind>>();

  useEffect(() => {
    ensureJoin(leaderboardProvider);
    setHiveMindProvider({ selfId: hiveMindSelfId, peerStatus$ });
    return () => {
      leave();
    };
  }, [leaderboardProvider]);

  return (
    <LeaderboardContext.Provider value={leaderboardProvider}>
      <HiveMindContext.Provider value={hiveMindProvider}>
        {children}
      </HiveMindContext.Provider>
    </LeaderboardContext.Provider>
  );
}

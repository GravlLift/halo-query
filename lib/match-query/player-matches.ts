import {
  ILeaderboardProvider,
  getPlayerEsrA as _getPlayerEsrA,
  getPlayerMatches as _getPlayerMatches,
  fetchFullyLoadedMatch,
} from '@gravllift/halo-helpers';
import { AssetVersionLink } from 'halo-infinite-api';
import { DateTime } from 'luxon';
import { Subject } from 'rxjs';
import { HaloCaches } from '@gravllift/halo-helpers';

export function getPlayerMatches(
  leaderboard:
    | Pick<ILeaderboardProvider, 'addLeaderboardEntries' | 'getEntries'>
    | undefined,
  gamertags: string[],
  options: Parameters<typeof _getPlayerMatches>[2],
  haloCaches: HaloCaches
) {
  const logger$ = new Subject<string>();
  const iterator = _getPlayerMatches(
    leaderboard,
    gamertags,
    options,
    haloCaches,
    logger$
  );

  return { iterator, logger$: logger$.asObservable() };
}

export async function getMatch(
  leaderboard:
    | Pick<ILeaderboardProvider, 'addLeaderboardEntries' | 'getEntries'>
    | undefined,
  matchId: string,
  haloCaches: HaloCaches,
  signal?: AbortSignal
) {
  const match = await haloCaches.matchStatsCache.get(matchId);
  return await fetchFullyLoadedMatch(
    leaderboard,
    match,
    [],
    signal ?? new AbortController().signal,
    haloCaches,
    true
  );
}

export function getPlayerEsrA(
  leaderboard:
    | Pick<ILeaderboardProvider, 'addLeaderboardEntries' | 'getEntries'>
    | undefined,
  playlistVersionLink: Omit<AssetVersionLink, 'AssetKind'>,
  xuid: string,
  asOf: DateTime,
  signal: AbortSignal,
  haloCaches: HaloCaches
) {
  return _getPlayerEsrA(
    leaderboard,
    playlistVersionLink,
    xuid,
    asOf,
    signal,
    haloCaches
  );
}

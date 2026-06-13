import {
  HaloCaches,
  getPlayerEsrA as _getPlayerEsrA,
  getPlayerMatches as _getPlayerMatches,
  fetchFullyLoadedMatch,
} from '@gravllift/halo-helpers';
import { AssetVersionLink } from 'halo-infinite-api';
import { DateTime } from 'luxon';
import { Subject } from 'rxjs';

export function getPlayerMatches(
  ...args: Parameters<typeof _getPlayerMatches>
) {
  const logger$ = new Subject<string>();
  const iterator = _getPlayerMatches(args[0], args[1], args[2], logger$);

  return { iterator, logger$: logger$.asObservable() };
}

export async function getMatch(
  matchId: string,
  haloCaches: HaloCaches,
  signal?: AbortSignal
) {
  const match = await haloCaches.matchStatsCache.get(matchId);
  return await fetchFullyLoadedMatch(
    match,
    [],
    signal ?? new AbortController().signal,
    haloCaches,
    true
  );
}
export function getPlayerEsrA(
  playlistVersionLink: Omit<AssetVersionLink, 'AssetKind'>,
  xuid: string,
  asOf: DateTime,
  signal: AbortSignal,
  haloCaches: HaloCaches
) {
  return _getPlayerEsrA(playlistVersionLink, xuid, asOf, signal, haloCaches);
}

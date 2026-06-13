import {
  fetchFullyLoadedMatch as _fetchFullyLoadedMatch,
  HaloCaches,
  PlayerMatchHistoryStatsSkill,
} from '@gravllift/halo-helpers';
import { MatchInfo } from 'halo-infinite-api';

export function fetchFullyLoadedMatch(
  match: { MatchId: string; MatchInfo: MatchInfo },
  users: { xuid: string }[],
  signal: AbortSignal,
  loadUserData: boolean,
  haloCaches: HaloCaches
): Promise<PlayerMatchHistoryStatsSkill> {
  return _fetchFullyLoadedMatch(match, users, signal, haloCaches, loadUserData);
}

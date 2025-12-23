import {
  fetchFullyLoadedMatch as _fetchFullyLoadedMatch,
  HaloCaches,
  HiveMindLeaderboardProvider,
  PlayerMatchHistoryStatsSkill,
} from '@gravllift/halo-helpers';
import { MatchInfo } from 'halo-infinite-api';

export function fetchFullyLoadedMatch(
  leaderboard: HiveMindLeaderboardProvider | undefined,
  match: { MatchId: string; MatchInfo: MatchInfo },
  users: { xuid: string }[],
  signal: AbortSignal,
  loadUserData: boolean,
  haloCaches: HaloCaches
): Promise<PlayerMatchHistoryStatsSkill> {
  return _fetchFullyLoadedMatch(
    leaderboard,
    match,
    users,
    signal,
    haloCaches,
    loadUserData
  );
}

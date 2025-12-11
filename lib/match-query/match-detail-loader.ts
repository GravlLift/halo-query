import {
  fetchFullyLoadedMatch as _fetchFullyLoadedMatch,
  ILeaderboardProvider,
  PlayerMatchHistoryStatsSkill,
} from '@gravllift/halo-helpers';
import { MatchInfo } from 'halo-infinite-api';
import { HaloCaches } from '@gravllift/halo-helpers';

export function fetchFullyLoadedMatch(
  leaderboard:
    | Pick<ILeaderboardProvider, 'addLeaderboardEntries' | 'getEntries'>
    | undefined,
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

import { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { createContext, useContext } from 'react';
import type { Observable } from 'rxjs';
import type { LeaderboardEntry } from '../../lib/leaderboard';

export const LeaderboardContext = createContext<
  | (ILeaderboardProvider & { newEntries$: Observable<LeaderboardEntry[]> })
  | undefined
>(undefined);

export const useLeaderboard = () => useContext(LeaderboardContext);

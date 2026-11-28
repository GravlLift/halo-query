import {
  LeaderboardEntry,
  ObservableLeaderboardProvider,
} from '@gravllift/halo-helpers';
import { createContext, useContext } from 'react';

export const LeaderboardContext = createContext<
  ObservableLeaderboardProvider<LeaderboardEntry> | undefined
>(undefined);

export const useLeaderboard = () => useContext(LeaderboardContext);

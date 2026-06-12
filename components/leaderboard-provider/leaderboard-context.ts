import {
  KnowledgeMapLeaderboardProvider,
  LeaderboardEntry,
} from '@gravllift/halo-helpers';
import { createContext, useContext } from 'react';
import type { Observable } from 'rxjs';

export const LeaderboardContext = createContext<
  | (KnowledgeMapLeaderboardProvider & {
      newEntries$: Observable<LeaderboardEntry[]>;
    })
  | undefined
>(undefined);

export const useLeaderboard = () => useContext(LeaderboardContext);

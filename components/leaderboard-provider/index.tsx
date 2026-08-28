import { ReactNode } from 'react';
import { useLeaderboardProvider } from './graph-ql-leaderboard';
import { LeaderboardContext } from './leaderboard-context';

export default function LeaderboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const leaderboard = useLeaderboardProvider();

  return (
    <LeaderboardContext.Provider value={leaderboard}>
      {children}
    </LeaderboardContext.Provider>
  );
}

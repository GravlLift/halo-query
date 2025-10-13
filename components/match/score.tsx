import { Box } from '@chakra-ui/react';
import {
  PlayerMatchHistoryStatsSkill,
  ProgressiveMatch,
} from '@gravllift/halo-helpers';
import styles from './match.module.css';
import { Stats } from 'halo-infinite-api';

export default function Score({
  match,
  teamPresets,
  roundBased,
}: {
  match: PlayerMatchHistoryStatsSkill | ProgressiveMatch;
  teamPresets: { color: string }[];
  roundBased: boolean;
}) {
  const matchStats = 'MatchStats' in match ? match.MatchStats : match;
  let scoringEntities:
    | { Stats: Stats; Rank: number; TeamId: number }[]
    | undefined;
  if (match.MatchInfo.TeamsEnabled) {
    scoringEntities = matchStats?.Teams;
  } else {
    scoringEntities = matchStats?.Players.map((p) => ({
      Rank: p.Rank,
      Stats: p.PlayerTeamStats[0].Stats,
      TeamId: p.LastTeamId,
    }));
  }

  if (scoringEntities?.length === 2) {
    return (
      <>
        <Box
          flexGrow={2}
          className={styles['score']}
          backgroundColor={teamPresets[0].color}
        >
          {roundBased
            ? scoringEntities[0].Stats.CoreStats.RoundsWon
            : scoringEntities[0].Stats.CoreStats.Score}
        </Box>
        <Box flexGrow={1} className={styles['score']}>
          -
        </Box>
        <Box
          flexGrow={2}
          className={styles['score']}
          backgroundColor={teamPresets[1].color}
        >
          {roundBased
            ? scoringEntities[1].Stats.CoreStats.RoundsWon
            : scoringEntities[1].Stats.CoreStats.Score}
        </Box>
      </>
    );
  } else if (scoringEntities?.length) {
    const winningEntity = scoringEntities.minBy((t) => t.Rank);
    const teamIndex = winningEntity.TeamId;
    const winningScore = roundBased
      ? winningEntity.Stats.CoreStats.RoundsWon
      : winningEntity.Stats.CoreStats.Score;
    return (
      <Box
        className={styles['score']}
        backgroundColor={teamPresets[teamIndex]?.color ?? 'gray.500'}
        paddingX={10}
      >
        {winningScore}
      </Box>
    );
  } else {
    return <></>;
  }
}

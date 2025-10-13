'use client';
import { getObjectivePoints } from '../../lib/stats/objective-points';
import {
  PlayerMatchHistoryStatsSkill,
  ProgressiveMatch,
} from '@gravllift/halo-helpers';
import RoleGraph from '../role-graph';

export default function FFARoleChart({
  match,
}: {
  match: PlayerMatchHistoryStatsSkill | ProgressiveMatch;
}) {
  const allObjectivePoints =
    'MatchStats' in match
      ? match.MatchStats?.Players.map((p) =>
          getObjectivePoints(
            match.MatchInfo.GameVariantCategory,
            p.PlayerTeamStats[0].Stats
          )
        ).filter((v): v is number => v != null)
      : undefined;
  const all = {
    kills:
      'MatchStats' in match
        ? match.MatchStats?.Players.sum(
            (p) => p.PlayerTeamStats[0].Stats.CoreStats.Kills
          )
        : undefined,
    assists:
      'MatchStats' in match
        ? match.MatchStats?.Players.sum(
            (p) => p.PlayerTeamStats[0].Stats.CoreStats.Assists
          )
        : undefined,
    damage:
      'MatchStats' in match
        ? match.MatchStats?.Players.sum(
            (p) => p.PlayerTeamStats[0].Stats.CoreStats.DamageDealt
          )
        : undefined,
    objective: allObjectivePoints?.length
      ? allObjectivePoints.sum()
      : undefined,
  };
  return (
    <RoleGraph
      height={400}
      stats={
        ('MatchStats' in match &&
          match.MatchStats?.Players.sortBy((p) => p.LastTeamId).map((p) => {
            const playerTeamStat = p.PlayerTeamStats[0];

            const objectivePoints = getObjectivePoints(
              match.MatchInfo.GameVariantCategory,
              playerTeamStat.Stats
            );
            return {
              gamertag: ('gamertag' in p && p.gamertag) || p.PlayerId || '???',
              kills: !all.kills
                ? 0
                : playerTeamStat.Stats.CoreStats.Kills / all.kills,
              assists: !all.assists
                ? 0
                : playerTeamStat.Stats.CoreStats.Assists / all.assists,
              damage: !all.damage
                ? 0
                : playerTeamStat.Stats.CoreStats.DamageDealt / all.damage,
              objective: !all.objective
                ? 0
                : objectivePoints != null && all.objective != null
                ? objectivePoints / all.objective
                : undefined,
            };
          })) ||
        []
      }
    />
  );
}

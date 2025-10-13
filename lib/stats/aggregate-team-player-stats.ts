import { GameVariantCategory, MatchStats, Stats } from 'halo-infinite-api';
import { Duration } from 'luxon';
type StatsArrays = Extract<
  Stats[keyof Stats][keyof Stats[keyof Stats]],
  Array<unknown>
>;
export function aggregatePlayersStats(
  players: MatchStats['Players'],
  teamId: number
) {
  const teamStats = players.reduce((prev, curr) => {
    const currStats =
      curr.PlayerTeamStats.find((s) => s.TeamId === teamId)?.Stats ??
      ({} as Stats);
    for (const currKey of Object.keys(currStats) as (keyof Stats)[]) {
      prev[currKey] ??= {} as Stats[keyof Stats];
      for (const currKey2 of Object.keys(
        currStats[currKey]
      ) as (keyof Stats[keyof Stats])[]) {
        if (prev[currKey][currKey2] == null) {
          if (currStats[currKey][currKey2] == null) {
            (prev[currKey][currKey2] as unknown as null) = null;
          } else if (typeof currStats[currKey][currKey2] === 'object') {
            (prev[currKey][
              currKey2
            ] as Stats[keyof Stats][keyof Stats[keyof Stats]]) = (
              currStats[currKey][currKey2] as StatsArrays
            ).map((o) => ({
              ...o,
            }));
          } else {
            (prev[currKey][
              currKey2
            ] as Stats[keyof Stats][keyof Stats[keyof Stats]]) =
              currStats[currKey][currKey2];
          }
        } else {
          switch (typeof currStats[currKey][currKey2]) {
            case 'number': {
              (prev[currKey][currKey2] as number) += currStats[currKey][
                currKey2
              ] as number;
              break;
            }
            case 'string': {
              const previousDuration = Duration.fromISO(
                prev[currKey][currKey2] as string
              );
              const currentDuration = Duration.fromISO(
                currStats[currKey][currKey2] as string
              );
              (prev[currKey][currKey2] as string | null) = previousDuration
                .plus(currentDuration)
                .toISO();
              break;
            }
            case 'object': {
              {
                const previousArray = prev[currKey][
                  currKey2 as keyof Stats[keyof Stats]
                ] as StatsArrays;
                const currentArray = currStats[currKey][
                  currKey2 as keyof Stats[keyof Stats]
                ] as StatsArrays;
                for (const entry of currentArray) {
                  const previousEntry = previousArray.find(
                    (e) => e.NameId === entry.NameId
                  );
                  if (previousEntry) {
                    previousEntry.Count += entry.Count;
                    previousEntry.TotalPersonalScoreAwarded +=
                      entry.TotalPersonalScoreAwarded;
                  } else {
                    previousArray.push({ ...entry });
                  }
                }
                break;
              }
            }
          }
        }
      }
    }
    return prev;
  }, {} as Stats);

  // Overrides that aren't a simple sum
  teamStats.CoreStats ??= {} as Stats['CoreStats'];
  teamStats.CoreStats.MaxKillingSpree = Math.max(
    ...players.map(
      (p) =>
        p.PlayerTeamStats.find((pts) => pts.TeamId === teamId)?.Stats?.CoreStats
          .MaxKillingSpree ?? 0
    )
  );
  teamStats.CoreStats.RoundsWon = Math.max(
    ...players.map(
      (p) =>
        p.PlayerTeamStats.find((pts) => pts.TeamId === teamId)?.Stats?.CoreStats
          .RoundsWon ?? 0
    )
  );
  teamStats.CoreStats.RoundsLost = Math.max(
    ...players.map(
      (p) =>
        p.PlayerTeamStats.find((pts) => pts.TeamId === teamId)?.Stats?.CoreStats
          .RoundsLost ?? 0
    )
  );
  teamStats.CoreStats.RoundsTied = Math.max(
    ...players.map(
      (p) =>
        p.PlayerTeamStats.find((pts) => pts.TeamId === teamId)?.Stats?.CoreStats
          .RoundsTied ?? 0
    )
  );
  teamStats.CoreStats.KDA =
    teamStats.CoreStats.Kills +
    teamStats.CoreStats.Assists / 3 -
    teamStats.CoreStats.Deaths;
  teamStats.CoreStats.Accuracy =
    teamStats.CoreStats.ShotsFired === 0
      ? 0
      : (teamStats.CoreStats.ShotsHit / teamStats.CoreStats.ShotsFired) * 100;
  teamStats.CoreStats.AverageLifeDuration =
    players.length === 0
      ? 'PT0S'
      : Duration.fromMillis(
          Duration.fromISO(teamStats.CoreStats.AverageLifeDuration).toMillis() /
            players.length
        ).toISO();

  if ('OddballStats' in teamStats) {
    teamStats.OddballStats.LongestTimeAsSkullCarrier = Duration.fromMillis(
      Math.max(
        ...players.map((p) =>
          Duration.fromISO(
            (
              p.PlayerTeamStats.find((pts) => pts.TeamId === teamId)
                ?.Stats as Stats<GameVariantCategory.MultiplayerOddball>
            ).OddballStats?.LongestTimeAsSkullCarrier ?? 'PT0S'
          ).toMillis()
        )
      )
    ).toISO();
  } else if ('VipStats' in teamStats) {
    teamStats.VipStats.LongestTimeAsVip = Duration.fromMillis(
      Math.max(
        ...players.map((p) =>
          Duration.fromISO(
            (
              p.PlayerTeamStats.find((pts) => pts.TeamId === teamId)
                ?.Stats as Stats<GameVariantCategory.MultiplayerVIP>
            ).VipStats?.LongestTimeAsVip ?? 'PT0S'
          ).toMillis()
        )
      )
    ).toISO();
  }

  return teamStats;
}

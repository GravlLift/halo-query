import '@gravllift/utilities';
import { GameVariantCategory, Stats } from 'halo-infinite-api';
import { Duration } from 'luxon';
import { percentFormatter } from '../../lib/formatters';
import '../../lib/luxon';
import { aggregatePlayersStats } from '../../lib/stats/aggregate-team-player-stats';
import PersonalScore from '../personal-score';
import { RowParameters, TableCategory, TableColumn } from './types';

function statsBaseColumns<TPrefix extends 'Player' | 'Team'>(
  prefix: TPrefix,
  stats?: Stats
) {
  let initialIndex;
  switch (prefix) {
    case 'Player':
      initialIndex = 105;
      break;
    case 'Team':
      initialIndex = 14;
      break;
    default:
      throw new Error(`Unknown prefix: ${prefix}`);
  }
  const statsSelectorFn: (props: RowParameters) => Stats | undefined =
    stats === undefined
      ? prefix === 'Player'
        ? ({ team, player }) =>
            player.PlayerTeamStats.find((p) => p.TeamId === team?.TeamId)?.Stats
        : ({ team }) =>
            team && 'Players' in team
              ? aggregatePlayersStats(team.Players, team.TeamId)
              : undefined
      : () => stats;
  const cols = {
    'Personal Score': {
      id: initialIndex + 0,
      text: 'Personal Score',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.PersonalScore,
      format: (score, args) => {
        if (score == null) {
          return null;
        }
        const personalScores = statsSelectorFn(args)?.CoreStats.PersonalScores;
        if (personalScores == null) {
          return score;
        }
        return <PersonalScore score={score} personalScores={personalScores} />;
      },
    } as TableColumn<number | undefined>,
    Score: {
      id: initialIndex + 1,
      text: 'Score',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.Score,
    },
    'Rounds Won': {
      id: initialIndex + 2,
      text: 'Won',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.RoundsWon,
    },
    'Rounds Lost': {
      id: initialIndex + 3,
      text: 'Lost',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.RoundsLost,
    },
    'Rounds Tied': {
      id: initialIndex + 4,
      text: 'Tied',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.RoundsTied,
    },
    Kills: {
      id: initialIndex + 5,
      text: 'Count',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.Kills,
    },
    'Kills Per Minute': {
      id: initialIndex + 6,
      text: 'per Min.',
      level: prefix,
      tooltip: 'Kills per minute',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const kills = statsSelectorFn(args)?.CoreStats.Kills;
        if (kills == null) {
          return undefined;
        } else if (kills === 0) {
          return 0;
        }

        let duration: Duration;
        if (prefix === 'Team') {
          duration = Duration.fromISO(args.match.MatchInfo.PlayableDuration);
        } else {
          duration = Duration.fromISO(args.player.ParticipationInfo.TimePlayed);
        }
        const durationMinutes = duration.as('minutes');
        if (durationMinutes === 0) {
          return Infinity;
        } else {
          return kills / duration.as('minutes');
        }
      },
      format: (killsPerMinute) => killsPerMinute?.toFixed(2),
    } as TableColumn<number | undefined>,
    Assists: {
      id: initialIndex + 7,
      text: 'Count',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        if (prefix === 'Team' && args.match.MatchInfo.TeamsEnabled) {
          // Some sort of bug with Halo's team assist summation
          return args.team && 'Players' in args.team
            ? args.team.Players.map(
                (player) =>
                  player.PlayerTeamStats.find(
                    (s) => s.TeamId === args.team?.TeamId
                  )?.Stats.CoreStats.Assists
              ).sum()
            : undefined;
        }
        return statsSelectorFn(args)?.CoreStats.Assists;
      },
    },
    'Assists Per Minute': {
      id: initialIndex + 8,
      text: 'per Min.',
      level: prefix,
      tooltip: 'Assists per minute',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const assists = statsSelectorFn(args)?.CoreStats.Assists;
        if (assists == null) {
          return undefined;
        } else if (assists === 0) {
          return 0;
        }

        let duration: Duration;
        if (prefix === 'Team') {
          duration = Duration.fromISO(args.match.MatchInfo.PlayableDuration);
        } else {
          duration = Duration.fromISO(args.player.ParticipationInfo.TimePlayed);
        }
        const durationMinutes = duration.as('minutes');
        if (durationMinutes === 0) {
          return Infinity;
        } else {
          return assists / duration.as('minutes');
        }
      },
      format: (assistsPerMinute) => assistsPerMinute?.toFixed(2),
    } as TableColumn<number | undefined>,
    Deaths: {
      id: initialIndex + 9,
      text: 'Count',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.Deaths,
    },
    'Deaths Per Minute': {
      id: initialIndex + 10,
      text: 'per Min.',
      level: prefix,
      tooltip: 'Deaths per minute',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const deaths = statsSelectorFn(args)?.CoreStats.Deaths;
        if (deaths == null) {
          return undefined;
        } else if (deaths === 0) {
          return 0;
        }

        let duration: Duration;
        if (prefix === 'Team') {
          duration = Duration.fromISO(args.match.MatchInfo.PlayableDuration);
        } else {
          duration = Duration.fromISO(args.player.ParticipationInfo.TimePlayed);
        }

        const durationMinutes = duration.as('minutes');
        if (durationMinutes === 0) {
          return Infinity;
        } else {
          return deaths / duration.as('minutes');
        }
      },
      format: (deathsPerMinute) => deathsPerMinute?.toFixed(2),
    } as TableColumn<number | undefined>,
    KDA: {
      id: initialIndex + 11,
      text: 'KDA',
      tooltip: '(Kills + (Assists / 3)) / Deaths',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        if (
          prefix === 'Team' &&
          args.team &&
          'Players' in args.team &&
          args.team.Players.length > 0
        ) {
          return args.team.Players.map(
            (p) =>
              p.PlayerTeamStats.find((p2) => p2.TeamId === args.team?.TeamId)
                ?.Stats?.CoreStats.KDA
          ).average();
        } else {
          return statsSelectorFn(args)?.CoreStats.KDA;
        }
      },
      format: (kda) => kda?.toFixed(2),
    } as TableColumn<number | undefined>,
    KD: {
      id: prefix === 'Player' ? 210 : 211,
      tooltip: 'Kills / Deaths',
      text: 'KD',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        if (
          prefix === 'Team' &&
          args.team &&
          'Players' in args.team &&
          args.team.Players.length > 0
        ) {
          return args.team.Players.map((p) => {
            const pts = p.PlayerTeamStats.find(
              (p2) => p2.TeamId === args.team?.TeamId
            );
            if (pts == null) {
              return undefined;
            } else if (pts.Stats.CoreStats.Kills === 0) {
              return 0;
            } else if (pts.Stats.CoreStats.Deaths === 0) {
              return Infinity;
            } else {
              return pts.Stats.CoreStats.Kills / pts.Stats.CoreStats.Deaths;
            }
          }).average();
        } else {
          const stats = statsSelectorFn(args)?.CoreStats;
          if (stats == null) {
            return undefined;
          } else if (stats.Kills === 0) {
            return 0;
          } else if (stats.Deaths === 0) {
            return Infinity;
          } else {
            return stats.Kills / stats.Deaths;
          }
        }
      },
      format: (kda) => kda?.toFixed(2),
    } as TableColumn<number | undefined>,
    Suicides: {
      id: initialIndex + 12,
      text: 'Suicides',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.Suicides,
    },
    Betrayals: {
      id: initialIndex + 13,
      text: 'Betrayals',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.Betrayals,
    },
    'Average Life': {
      id: initialIndex + 14,
      text: 'Average Life',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: ({ match, team, player }) =>
        statsSelectorFn({ match, team, player })?.CoreStats.AverageLifeDuration,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'Time Played': {
      id: initialIndex + 15,
      text: 'Time Played',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: ({ match, player }) => {
        if (prefix === 'Team') {
          return match.MatchInfo.PlayableDuration;
        } else {
          return player.ParticipationInfo.TimePlayed;
        }
      },
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'Damage Dealt': {
      id: initialIndex + 16,
      text: 'Total',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.DamageDealt,
    },
    'Damage Dealt Per Minute': {
      id: initialIndex + 17,
      text: 'per Min.',
      level: prefix,
      tooltip: 'Damage dealt per minute',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const damageDealt = statsSelectorFn(args)?.CoreStats.DamageDealt;
        if (damageDealt == null) {
          return undefined;
        } else if (damageDealt === 0) {
          return 0;
        }

        let duration: Duration;
        if (prefix === 'Team') {
          duration = Duration.fromISO(args.match.MatchInfo.PlayableDuration);
        } else {
          duration = Duration.fromISO(args.player.ParticipationInfo.TimePlayed);
        }
        const durationMinutes = duration.as('minutes');
        if (durationMinutes === 0) {
          return Infinity;
        } else {
          return damageDealt / duration.as('minutes');
        }
      },
      format: (damageDealtPerMinute) => damageDealtPerMinute?.toFixed(2),
    } as TableColumn<number | undefined>,
    'Damage Taken': {
      id: initialIndex + 18,
      text: 'Total',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.DamageTaken,
    },
    'Damage Taken Per Minute': {
      id: initialIndex + 19,
      text: 'per Min.',
      level: prefix,
      tooltip: 'Damage taken per minute',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const damageTaken = statsSelectorFn(args)?.CoreStats.DamageTaken;
        if (damageTaken == null) {
          return undefined;
        } else if (damageTaken === 0) {
          return 0;
        }

        let duration: Duration;
        if (prefix === 'Team') {
          duration = Duration.fromISO(args.match.MatchInfo.PlayableDuration);
        } else {
          duration = Duration.fromISO(args.player.ParticipationInfo.TimePlayed);
        }

        const durationMinutes = duration.as('minutes');
        if (durationMinutes === 0) {
          return Infinity;
        } else {
          return damageTaken / duration.as('minutes');
        }
      },
      format: (damageTakenPerMinute) => damageTakenPerMinute?.toFixed(2),
    } as TableColumn<number | undefined>,
    'Shots Fired': {
      id: initialIndex + 20,
      text: 'Shots Fired',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.ShotsFired,
    },
    'Shots Hit': {
      id: initialIndex + 21,
      text: 'Shots Hit',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.ShotsHit,
    },
    Accuracy: {
      id: initialIndex + 22,
      text: 'Accuracy',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.Accuracy,
      format: (accuracy) => {
        if (accuracy == null) {
          return '';
        } else {
          return percentFormatter.format(accuracy / 100);
        }
      },
    } as TableColumn<number>,
    'Perfect Kills': {
      id: initialIndex + 23,
      text: 'Perfect Kills',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const stats = statsSelectorFn(args);
        return stats != null
          ? stats.CoreStats.Medals?.find((m) => m.NameId === 1512363953)
              ?.Count ?? 0
          : undefined;
      },
      format: (value) => value?.toFixed(0),
    } as TableColumn<number | undefined>,
    'Callout Assists': {
      id: initialIndex + 24,
      text: 'Callout Assists',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.CalloutAssists,
    },
    'Max Killing Spree': {
      id: initialIndex + 25,
      text: 'Max Killing Spree',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.MaxKillingSpree,
    },
    'Kill Types - Grenade': {
      id: initialIndex + 26,
      text: 'Grenade',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.GrenadeKills,
    },
    'Kill Types - Headshot': {
      id: initialIndex + 27,
      text: 'Headshot',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.HeadshotKills,
    },
    'Kill Types - Melee': {
      id: initialIndex + 28,
      text: 'Melee',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.MeleeKills,
    },

    'Kill Types - Power Weapon': {
      id: initialIndex + 29,
      text: 'Power Weapon',
      level: prefix,
      cellProps: { isNumeric: true },
      rawValue: (args) => statsSelectorFn(args)?.CoreStats.PowerWeaponKills,
    },
    'Oddball - Kills as Carrier': {
      id: initialIndex + 30,
      text: 'Kills as Carrier',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerOddball,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerOddball>)
          ?.OddballStats?.KillsAsSkullCarrier,
    },
    'Oddball - Longest Carry Time': {
      id: initialIndex + 31,
      text: 'Longest Carry Time',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerOddball,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerOddball>)
          ?.OddballStats?.LongestTimeAsSkullCarrier,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'Oddball - Skull Carriers Killed': {
      id: initialIndex + 32,
      text: 'Carriers Killed',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerOddball,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerOddball>)
          ?.OddballStats?.SkullCarriersKilled,
    },
    'Oddball - Skull Grabs': {
      id: initialIndex + 33,
      text: 'Skull Grabs',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerOddball,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerOddball>)
          ?.OddballStats?.SkullGrabs,
    },
    'Oddball - Points': {
      id: initialIndex + 34,
      text: 'Points',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerOddball,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerOddball>)
          ?.OddballStats?.SkullScoringTicks,
    },
    'Oddball - Carry Time': {
      id: initialIndex + 35,
      text: 'Carry Time',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerOddball,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerOddball>)
          ?.OddballStats?.TimeAsSkullCarrier,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'CTF - Capture Assists': {
      id: initialIndex + 36,
      text: 'Capture Assists',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagCaptureAssists,
    },
    'CTF - Captures': {
      id: initialIndex + 37,
      text: 'Captures',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagCaptures,
    },
    'CTF - Carriers Killed': {
      id: initialIndex + 38,
      text: 'Carriers Killed',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagCarriersKilled,
    },
    'CTF - Flag Grabs': {
      id: initialIndex + 39,
      text: 'Flag Grabs',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagGrabs,
    },
    'CTF - Returners Killed': {
      id: initialIndex + 40,
      text: 'Returners Killed',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagReturnersKilled,
    },
    'CTF - Returns': {
      id: initialIndex + 41,
      text: 'Returns',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagReturns,
    },
    'CTF - Secures': {
      id: initialIndex + 42,
      text: 'Secures',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagSecures,
    },
    'CTF - Steals': {
      id: initialIndex + 43,
      text: 'Steals',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.FlagSteals,
    },
    'CTF - Kills as Carrier': {
      id: initialIndex + 44,
      text: 'Kills as Carrier',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.KillsAsFlagCarrier,
    },
    'CTF - Kills as Returner': {
      id: initialIndex + 45,
      text: 'Kills as Returner',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.KillsAsFlagReturner,
    },
    'CTF - Time as Carrier': {
      id: initialIndex + 46,
      text: 'Time as Carrier',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerCtf,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerCtf>)
          ?.CaptureTheFlagStats?.TimeAsFlagCarrier,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'KOTH - Captures': {
      id: initialIndex + 47,
      text: 'Captures',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerKingOfTheHill,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerKingOfTheHill>
        )?.ZonesStats?.StrongholdCaptures,
    },
    'KOTH - Defensive Kills': {
      id: initialIndex + 48,
      text: 'Defensive Kills',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerKingOfTheHill,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerKingOfTheHill>
        )?.ZonesStats?.StrongholdDefensiveKills,
    },
    'KOTH - Offensive Kills': {
      id: initialIndex + 49,
      text: 'Offensive Kills',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerKingOfTheHill,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerKingOfTheHill>
        )?.ZonesStats?.StrongholdOffensiveKills,
    },
    'KOTH - Occupation Time': {
      id: initialIndex + 50,
      text: 'Occupation Time',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerKingOfTheHill,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerKingOfTheHill>
        )?.ZonesStats?.StrongholdOccupationTime,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'KOTH - Points': {
      id: initialIndex + 51,
      text: 'Points',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerKingOfTheHill,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerKingOfTheHill>
        )?.ZonesStats?.StrongholdScoringTicks,
    },
    'Strongholds - Defensive Kills': {
      id: initialIndex + 52,
      text: 'Defensive Kills',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerStrongholds,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerStrongholds>
        )?.ZonesStats?.StrongholdDefensiveKills,
    },
    'Strongholds - Offensive Kills': {
      id: initialIndex + 53,
      text: 'Offensive Kills',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerStrongholds,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerStrongholds>
        )?.ZonesStats?.StrongholdOffensiveKills,
    },
    'Strongholds - Occupation Time': {
      id: initialIndex + 54,
      text: 'Occupation Time',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerStrongholds,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerStrongholds>
        )?.ZonesStats?.StrongholdOccupationTime,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'Strongholds - Captures': {
      id: initialIndex + 55,
      text: 'Captures',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerStrongholds,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerStrongholds>
        )?.ZonesStats?.StrongholdCaptures,
    },
    'Strongholds - Secures': {
      id: initialIndex + 56,
      text: 'Secures',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerStrongholds,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerStrongholds>
        )?.ZonesStats?.StrongholdSecures,
    },
    'Extraction - Successful Extractions': {
      id: initialIndex + 57,
      text: 'Successful Extractions',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerExtraction,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerExtraction>
        )?.ExtractionStats?.SuccessfulExtractions,
    },
    'Extraction - Conversions Denied': {
      id: initialIndex + 58,
      text: 'Conversions Denied',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerExtraction,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerExtraction>
        )?.ExtractionStats?.ExtractionConversionsDenied,
    },
    'Extraction - Conversions Completed': {
      id: initialIndex + 59,
      text: 'Conversions Completed',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerExtraction,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerExtraction>
        )?.ExtractionStats?.ExtractionConversionsCompleted,
    },
    'Extraction - Initiation Denied': {
      id: initialIndex + 60,
      text: 'Initiations Denied',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerExtraction,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerExtraction>
        )?.ExtractionStats?.ExtractionInitiationsDenied,
    },
    'Extraction - Initiation Completed': {
      id: initialIndex + 61,
      text: 'Initiations Completed',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerExtraction,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (
          statsSelectorFn(
            args
          ) as Stats<GameVariantCategory.MultiplayerExtraction>
        )?.ExtractionStats?.ExtractionInitiationsCompleted,
    },
    'VIP - VIP Kills': {
      id: initialIndex + 62,
      text: 'VIP Kills',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.VipKills,
    },
    'VIP - VIP Assists': {
      id: initialIndex + 63,
      text: 'VIP Assists',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.VipAssists,
    },
    'VIP - Kills as VIP': {
      id: initialIndex + 64,
      text: 'Kills as VIP',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.KillsAsVip,
    },
    'VIP - Times Selected as VIP': {
      id: initialIndex + 65,
      text: 'Times Selected as VIP',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.TimesSelectedAsVip,
    },
    'VIP - Max Killing Spree as VIP': {
      id: initialIndex + 66,
      text: 'Max Killing Spree as VIP',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.MaxKillingSpreeAsVip,
    },
    'VIP - Time as VIP': {
      id: initialIndex + 67,
      text: 'Time as VIP',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.TimeAsVip,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
    'VIP - Longest Time as VIP': {
      id: initialIndex + 68,
      text: 'Longest Time as VIP',
      level: prefix,
      gameVariantSpecific: GameVariantCategory.MultiplayerVIP,
      cellProps: { isNumeric: true },
      rawValue: (args) =>
        (statsSelectorFn(args) as Stats<GameVariantCategory.MultiplayerVIP>)
          ?.VipStats?.LongestTimeAsVip,
      format: (duration) =>
        duration != null ? Duration.fromISO(duration).toDecisecondFormat() : '',
    } as TableColumn<string>,
  } satisfies Record<string, TableColumn>;

  return Object.fromEntries(
    Object.entries(cols).map(([key, value]) => [`${prefix} ${key}`, value])
  ) as {
    [K in `${TPrefix} ${keyof typeof cols}`]: K extends `${TPrefix} ${infer TSuffix extends keyof typeof cols}`
      ? (typeof cols)[TSuffix]
      : never;
  };
}

export function statsColumns<TPrefix extends 'Player' | 'Team'>(
  prefix: TPrefix,
  stats?: Stats
) {
  const baseColumns = statsBaseColumns(prefix, stats);
  const categories = [
    {
      text: 'Kills',
      children: [
        baseColumns[`${prefix} Kills`],
        baseColumns[`${prefix} Kills Per Minute`],
      ],
    },
    {
      text: 'Deaths',
      children: [
        baseColumns[`${prefix} Deaths`],
        baseColumns[`${prefix} Deaths Per Minute`],
      ],
    },
    {
      text: 'Assists',
      children: [
        baseColumns[`${prefix} Assists`],
        baseColumns[`${prefix} Assists Per Minute`],
      ],
    },
    {
      text: 'Damage Dealt',
      children: [
        baseColumns[`${prefix} Damage Dealt`],
        baseColumns[`${prefix} Damage Dealt Per Minute`],
      ],
    },
    {
      text: 'Damage Taken',
      children: [
        baseColumns[`${prefix} Damage Taken`],
        baseColumns[`${prefix} Damage Taken Per Minute`],
      ],
    },
    {
      children: [
        baseColumns[`${prefix} KD`],
        baseColumns[`${prefix} KDA`],
        baseColumns[`${prefix} Average Life`],
        baseColumns[`${prefix} Time Played`],
        baseColumns[`${prefix} Shots Fired`],
        baseColumns[`${prefix} Shots Hit`],
        baseColumns[`${prefix} Accuracy`],
        baseColumns[`${prefix} Perfect Kills`],
        baseColumns[`${prefix} Personal Score`],
        baseColumns[`${prefix} Callout Assists`],
        baseColumns[`${prefix} Max Killing Spree`],
        baseColumns[`${prefix} Suicides`],
        baseColumns[`${prefix} Betrayals`],
      ],
    },
    {
      text: 'Kill Types',
      children: [
        baseColumns[`${prefix} Kill Types - Grenade`],
        baseColumns[`${prefix} Kill Types - Headshot`],
        baseColumns[`${prefix} Kill Types - Melee`],
        baseColumns[`${prefix} Kill Types - Power Weapon`],
      ],
    },
    {
      text: 'Oddball',
      children: [
        baseColumns[`${prefix} Oddball - Kills as Carrier`],
        baseColumns[`${prefix} Oddball - Longest Carry Time`],
        baseColumns[`${prefix} Oddball - Skull Carriers Killed`],
        baseColumns[`${prefix} Oddball - Skull Grabs`],
        baseColumns[`${prefix} Oddball - Points`],
        baseColumns[`${prefix} Oddball - Carry Time`],
      ],
    },
    {
      text: 'Capture the Flag',
      children: [
        baseColumns[`${prefix} CTF - Captures`],
        baseColumns[`${prefix} CTF - Capture Assists`],
        baseColumns[`${prefix} CTF - Carriers Killed`],
        baseColumns[`${prefix} CTF - Flag Grabs`],
        baseColumns[`${prefix} CTF - Returners Killed`],
        baseColumns[`${prefix} CTF - Returns`],
        baseColumns[`${prefix} CTF - Secures`],
        baseColumns[`${prefix} CTF - Steals`],
        baseColumns[`${prefix} CTF - Kills as Carrier`],
        baseColumns[`${prefix} CTF - Kills as Returner`],
        baseColumns[`${prefix} CTF - Time as Carrier`],
      ],
    },
    {
      text: 'King of the Hill',
      children: [
        baseColumns[`${prefix} KOTH - Points`],
        baseColumns[`${prefix} KOTH - Defensive Kills`],
        baseColumns[`${prefix} KOTH - Offensive Kills`],
        baseColumns[`${prefix} KOTH - Occupation Time`],
        baseColumns[`${prefix} KOTH - Captures`],
      ],
    },
    {
      text: 'Strongholds',
      children: [
        baseColumns[`${prefix} Strongholds - Captures`],
        baseColumns[`${prefix} Strongholds - Secures`],
        baseColumns[`${prefix} Strongholds - Defensive Kills`],
        baseColumns[`${prefix} Strongholds - Offensive Kills`],
        baseColumns[`${prefix} Strongholds - Occupation Time`],
      ],
    },
    {
      text: 'Extraction',
      children: [
        baseColumns[`${prefix} Extraction - Successful Extractions`],
        baseColumns[`${prefix} Extraction - Conversions Denied`],
        baseColumns[`${prefix} Extraction - Conversions Completed`],
        baseColumns[`${prefix} Extraction - Initiation Denied`],
        baseColumns[`${prefix} Extraction - Initiation Completed`],
      ],
    },
    {
      text: 'VIP',
      children: [
        baseColumns[`${prefix} VIP - VIP Kills`],
        baseColumns[`${prefix} VIP - VIP Assists`],
        baseColumns[`${prefix} VIP - Kills as VIP`],
        baseColumns[`${prefix} VIP - Times Selected as VIP`],
        baseColumns[`${prefix} VIP - Max Killing Spree as VIP`],
        baseColumns[`${prefix} VIP - Time as VIP`],
        baseColumns[`${prefix} VIP - Longest Time as VIP`],
      ],
    },
    {
      text: 'Rounds',
      children: [
        baseColumns[`${prefix} Rounds Won`],
        baseColumns[`${prefix} Rounds Lost`],
        baseColumns[`${prefix} Rounds Tied`],
      ],
    },
    {
      children: [baseColumns[`${prefix} Score`]],
    },
  ] satisfies TableCategory[];
  return {
    categories,
    columns: baseColumns,
  };
}

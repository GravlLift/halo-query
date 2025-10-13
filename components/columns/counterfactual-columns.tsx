'use client';
import '@gravllift/utilities';
import { toFixed343 } from '../../lib/render-helpers';
import { RowParameters, TableColumn } from './types';
import { Duration } from 'luxon';

export function counterfactualColumns<
  TPrefix extends
    | 'Player'
    | 'Bronze'
    | 'Silver'
    | 'Gold'
    | 'Platinum'
    | 'Diamond'
    | 'Onyx'
>(
  prefix: TPrefix,
  counterfactualSelectorFn: (args: RowParameters) =>
    | {
        Kills: number | 'NaN';
        Deaths: number | 'NaN';
      }
    | undefined,
  initialIndex: number
) {
  const cols = {
    'Expected Kills': {
      id: initialIndex + 0,
      text: 'Kills',
      level: 'Player',
      cellProps: { isNumeric: true },
      rawValue: (args) => counterfactualSelectorFn(args)?.Kills,
      format: (value) => toFixed343(value),
      tooltip: `Number of kills ${
        prefix === 'Player'
          ? 'the player'
          : `${prefix === 'Onyx' ? 'an Onyx' : `a ${prefix}`} player`
      } is expected to get based on their skill and the skill of the rest of the lobby.`,
    } as TableColumn<number | 'NaN' | undefined>,
    'Expected Kills per Minute': {
      id: initialIndex + 1,
      text: 'Kills per Min.',
      level: 'Player',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const expectedKills = counterfactualSelectorFn(args)?.Kills;
        if (expectedKills == null || expectedKills === 'NaN') {
          return undefined;
        } else if (expectedKills === 0) {
          return 0;
        }

        const durationMinutes = Duration.fromISO(
          args.player.ParticipationInfo.TimePlayed
        ).as('minutes');

        if (durationMinutes === 0) {
          return 0;
        } else {
          return expectedKills / durationMinutes;
        }
      },
      format: (value) => toFixed343(value),
      tooltip: `Number of kills ${
        prefix === 'Player'
          ? 'the player'
          : `${prefix === 'Onyx' ? 'an Onyx' : prefix} player`
      } is expected to get per minute based on their skill and the skill of the rest of the lobby.`,
    } as TableColumn<number | 'NaN' | undefined>,
    'Expected Deaths': {
      id: initialIndex + 2,
      text: 'Deaths',
      level: 'Player',
      cellProps: { isNumeric: true },
      rawValue: (args) => counterfactualSelectorFn(args)?.Deaths,
      format: (value) => toFixed343(value),
      tooltip: `Number of deaths ${
        prefix === 'Player'
          ? 'the player'
          : `${prefix === 'Onyx' ? 'an Onyx' : prefix} player`
      } is expected to get based on their skill and the skill of the rest of the lobby.`,
    } as TableColumn<number | 'NaN' | undefined>,
    'Expected Deaths per Minute': {
      id: initialIndex + 3,
      text: 'Deaths per Min.',
      level: 'Player',
      cellProps: { isNumeric: true },
      rawValue: (args) => {
        const expectedDeaths = counterfactualSelectorFn(args)?.Deaths;
        if (expectedDeaths == null || expectedDeaths === 'NaN') {
          return undefined;
        } else if (expectedDeaths === 0) {
          return 0;
        }

        const durationMinutes = Duration.fromISO(
          args.player.ParticipationInfo.TimePlayed
        ).as('minutes');
        if (durationMinutes === 0) {
          return 0;
        } else {
          return expectedDeaths / durationMinutes;
        }
      },
      format: (value) => toFixed343(value),
      tooltip: `Number of deaths ${
        prefix === 'Player'
          ? 'the player'
          : `${prefix === 'Onyx' ? 'an Onyx' : prefix} player`
      } is expected to get per minute based on their skill and the skill of the rest of the lobby.`,
    } as TableColumn<number | 'NaN' | undefined>,
  };

  return Object.fromEntries(
    Object.entries(cols).map(([key, value]) => [`${prefix} ${key}`, value])
  ) as {
    [K in `${TPrefix} ${keyof typeof cols}`]: K extends `${TPrefix} ${infer TSuffix extends keyof typeof cols}`
      ? (typeof cols)[TSuffix]
      : never;
  };
}

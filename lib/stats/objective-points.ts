import { GameVariantCategory, Stats } from 'halo-infinite-api';
import { statsColumns } from '../../components/columns/stats-columns';
import { RowParameters } from '../../components/columns/types';

type ColumnNames = keyof ReturnType<typeof statsColumns<'Player'>>['columns'];

export const objectivePointsFormulas = {
  [GameVariantCategory.MultiplayerOddball]: {
    'Player Oddball - Points': 1,
  },
  [GameVariantCategory.MultiplayerStrongholds]: {
    'Player Strongholds - Secures': 25,
    'Player Strongholds - Captures': 50,
  },
  [GameVariantCategory.MultiplayerCtf]: {
    'Player CTF - Captures': 300,
    'Player CTF - Capture Assists': 100,
    'Player CTF - Steals': 25,
  },
  [GameVariantCategory.MultiplayerKingOfTheHill]: {
    'Player KOTH - Points': 1,
  },
  [GameVariantCategory.MultiplayerExtraction]: {
    'Player Extraction - Initiation Completed': 1,
    'Player Extraction - Conversions Completed': 1,
  },
  [GameVariantCategory.MultiplayerMinigame]: {
    'Player Score': 1,
  },
} satisfies {
  [key in GameVariantCategory]?: {
    [key in ColumnNames]?: number;
  };
};

export function getObjectivePoints<
  TGameVariantCategory extends GameVariantCategory
>(
  gameVariantCategory: TGameVariantCategory,
  stats: Stats<TGameVariantCategory>
): number | undefined {
  const formulas =
    objectivePointsFormulas[
      gameVariantCategory as keyof typeof objectivePointsFormulas
    ];
  if (!formulas) return undefined;

  const statColumns = statsColumns('Player', stats);

  return Object.entries(formulas).reduce((acc, [key, value]) => {
    const stat = statColumns.columns[key as ColumnNames]?.rawValue(
      {} as RowParameters
    );
    if (typeof stat !== 'number') return acc;

    return acc + stat * value;
  }, 0);
}

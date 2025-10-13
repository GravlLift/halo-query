import { TableCellProps } from '@chakra-ui/react';
import { Field } from '@react-awesome-query-builder/ui';
import { GameVariantCategory } from 'halo-infinite-api';
import {
  PlayerMatchHistoryStatsSkill,
  ProgressiveMatch,
} from '@gravllift/halo-helpers';

export type RowParameters = {
  match: PlayerMatchHistoryStatsSkill | ProgressiveMatch;
  team:
    | (
        | PlayerMatchHistoryStatsSkill['MatchStats']['Teams']
        | ProgressiveMatch['Teams']
      )[number]
    | undefined;
  player: (
    | PlayerMatchHistoryStatsSkill['MatchStats']['Players']
    | ProgressiveMatch['Players']
  )[number];
};

export interface TableCategory<
  TChildType extends TableCategory<TableColumn> | TableColumn = TableColumn
> {
  text?: string;
  children: TChildType[];
}

type BaseTableColumn = {
  id: number;
  text: string;
  level: 'Match' | 'Team' | 'Player';
  cellProps?: TableCellProps & { isNumeric?: true };
  tooltip?: string;
  gameVariantSpecific?: GameVariantCategory;
} & Partial<Pick<Field, 'type' | 'fieldSettings' | 'excludeOperators'>>;

export type TableColumnWithFormat<T extends React.ReactNode> =
  BaseTableColumn & {
    rawValue: (props: RowParameters) => T;
    format: (contents: T, props: RowParameters) => React.ReactNode;
    queryValue?: (props: RowParameters) => unknown;
  };
export type TableColumnWithoutFormat = BaseTableColumn & {
  rawValue: (props: RowParameters) => React.ReactNode;
};

export type TableColumn<T extends React.ReactNode = React.ReactNode> =
  | TableColumnWithFormat<T>
  | TableColumnWithoutFormat;

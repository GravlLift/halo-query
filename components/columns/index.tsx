'use client';
import '@gravllift/utilities';
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { ColumnName, columns } from './base-columns';
import { localStorageEvent } from '../../lib/local-storage/event-based-localstorage';

export enum Preset {
  Default = 'Default',
  Counterfactuals = 'Counterfactuals',
  HaloDataHive = 'Swarm',
  HaloWaypoint = 'Landmark',
  ShywaysBotTraining = "Shyway's Bot Training",
  Everything = 'EVERYTHING',
}

export const columnPresets = {
  Default: [
    'Start Time',
    'Playlist',
    'Map',
    'Game Variant Category',
    'Duration',
    'Outcome',
    'Player Team MMR',
    'Enemy Team MMR',
    'Pre CSR',
    'CSR Delta',
    'Player Kills',
    'Player Deaths',
    'Player Expected Skill Rank Combined',
    'Player Performance Skill Rank Kills',
  ],
  Counterfactuals: [
    'Start Time',
    'Map',
    'Game Variant Category',
    'Duration',
    'Outcome',
    'Player Expected Kills',
    'Player Expected Deaths',
    'Bronze Expected Kills',
    'Bronze Expected Deaths',
    'Silver Expected Kills',
    'Silver Expected Deaths',
    'Gold Expected Kills',
    'Gold Expected Deaths',
    'Platinum Expected Kills',
    'Platinum Expected Deaths',
    'Diamond Expected Kills',
    'Diamond Expected Deaths',
    'Onyx Expected Kills',
    'Onyx Expected Deaths',
  ],
  Swarm: [
    'Playlist',
    'Outcome',
    'Map',
    'Player Team Score',
    'Enemy Team Score',
    'Duration',
    'Map',
    'Game Variant Category',
    'Player Kills',
    'Player Deaths',
    'Player Assists',
    'Player Damage Dealt',
    'Player Damage Taken',
    'Player KDA',
    'Player Accuracy',
    'Pre CSR',
    'CSR Delta',
  ],
  Landmark: [
    'Outcome',
    'Player Team Score',
    'Enemy Team Score',
    'Playlist',
    'Game Variant',
    'Map',
    'Start Time',
  ],
  "Shyway's Bot Training": [
    'Start Time',
    'Map',
    'Player Perfect Kills',
    'Player Damage Dealt',
    'Player Damage Taken',
    'Player Accuracy',
    'Player Kills',
    'Player Deaths',
    'Player Assists',
    'Player Kill Types - Headshot',
  ],
  EVERYTHING: Object.keys(columns) as ColumnName[],
} satisfies Record<Preset, ColumnName[]>;

export function getColumnPreset(preset: Preset) {
  return columnPresets[preset].map(
    (columnName: ColumnName) => columns[columnName]
  );
}

export type UseColumnsProps = {
  columnPreset: Preset | 'Custom';
  setColumnPreset: (preset: Preset | 'Custom') => void;
  customVisibleColumns: ColumnName[];
  setCustomVisibleColumns: Dispatch<SetStateAction<ColumnName[]>>;
  visibleColumns: (typeof columns)[ColumnName][];
};

export function useColumns(
  initialColumns: bigint | Preset | undefined
): UseColumnsProps {
  useEffect(() => {
    if (initialColumns) {
      return;
    }

    const matchesColumnsJson =
      typeof localStorage !== 'undefined'
        ? localStorageEvent.getItem('matchesColumns')
        : undefined;
    const matchesColumns:
      | {
          preset: Preset | 'Custom';
          customColumns: ColumnName[];
        }
      | undefined = matchesColumnsJson
      ? JSON.parse(matchesColumnsJson)
      : undefined;

    if (matchesColumns?.preset) {
      setColumnPreset(matchesColumns.preset);
    }
    if (matchesColumns?.customColumns) {
      setCustomVisibleColumns(matchesColumns.customColumns);
    }
  }, [initialColumns]);

  const [columnPreset, setColumnPreset] = useState<Preset | 'Custom'>(
    typeof initialColumns === 'bigint' ? 'Custom' : Preset.Default
  );

  const [customVisibleColumns, setCustomVisibleColumns] = useState<
    ColumnName[]
  >(
    typeof initialColumns === 'bigint'
      ? Object.entries(columns)
          .filter(([_, col]) => {
            const columnMask = 1n << BigInt(col.id);
            return (initialColumns & columnMask) === columnMask;
          })
          .map(([name]) => name as ColumnName)
      : columnPresets[initialColumns ?? Preset.Default]
  );
  const visibleColumns = useMemo((): (typeof columns)[ColumnName][] => {
    let selectedColumnNames: ColumnName[];
    if (columnPreset === 'Custom') {
      selectedColumnNames = customVisibleColumns;
    } else {
      selectedColumnNames = columnPresets[columnPreset];
    }
    return selectedColumnNames.map((columnName) => columns[columnName]);
  }, [columnPreset, customVisibleColumns]);

  useEffect(() => {
    const existingConfigJSON = localStorageEvent.getItem('matchesColumns');
    const existingConfig = existingConfigJSON
      ? JSON.parse(existingConfigJSON)
      : undefined;

    localStorageEvent.setItem(
      'matchesColumns',
      JSON.stringify({
        ...existingConfig,
        preset: columnPreset,
      })
    );
  }, [columnPreset]);

  useEffect(() => {
    const existingConfigJSON = localStorageEvent.getItem('matchesColumns');
    const existingConfig = existingConfigJSON
      ? JSON.parse(existingConfigJSON)
      : undefined;

    localStorageEvent.setItem(
      'matchesColumns',
      JSON.stringify({
        ...existingConfig,
        customColumns: customVisibleColumns.filter((name) => columns[name]),
      })
    );
  }, [customVisibleColumns]);

  return {
    columnPreset,
    setColumnPreset,
    customVisibleColumns,
    setCustomVisibleColumns,
    visibleColumns,
  };
}

// Doesn't work :/
// export type UseColumnsProps = {
//   columnPreset: Preset | 'Custom';
//   customVisibleColumns: ColumnName[];
//   visibleColumns: (typeof columns)[ColumnName][];
//   setColumnPreset: (preset: Preset | 'Custom') => void;
//   setCustomVisibleColumns: (columns: ColumnName[]) => void;
//   setColumnOptions: Dispatch<
//     SetStateAction<{
//       columnPreset: Preset | 'Custom';
//       customVisibleColumns: ColumnName[];
//     }>
//   >;
// };

// export function useColumns(): UseColumnsProps {
//   const [columnOpts, setColumnOptions] = useLocalStorage<{
//     columnPreset: Preset | 'Custom';
//     customVisibleColumns: ColumnName[];
//   }>('matchesColumns', {
//     columnPreset: Preset.Default,
//     customVisibleColumns: [],
//   });
//   const visibleColumns = useMemo((): (typeof columns)[ColumnName][] => {
//     if (columnOpts.columnPreset === 'Custom') {
//       return columnOpts.customVisibleColumns.map(
//         (columnName) => columns[columnName]
//       );
//     } else {
//       return columnPresets[columnOpts.columnPreset].map(
//         (columnName) => columns[columnName]
//       );
//     }
//   }, [columnOpts]);

//   return {
//     columnPreset: columnOpts.columnPreset,
//     customVisibleColumns: columnOpts.customVisibleColumns,
//     visibleColumns,
//     setColumnOptions,
//     setColumnPreset: (preset: Preset | 'Custom') => {
//       setColumnOptions((v) => ({
//         ...v,
//         columnPreset: preset,
//       }));
//     },
//     setCustomVisibleColumns: (columns: ColumnName[]) => {
//       setColumnOptions((v) => ({
//         ...v,
//         customVisibleColumns: columns,
//       }));
//     },
//   };
// }

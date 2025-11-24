import {
  BasicConfig,
  Config,
  Field,
  Fields,
  ListItem,
} from '@react-awesome-query-builder/ui';
import { MatchOutcome, ServiceRecord } from 'halo-infinite-api';
import { useMemo } from 'react';
import { columns, type ColumnName } from '../../../columns/base-columns';
import GameVariantCategoryDisplay from '../../../game-variant-category-display/game-variant-category-display';
import OutcomeDisplay from '../../../outcome-display/outcome-display';
import operators from '../components/operators';
import {
  ChakraButton,
  ChakraButtonGroup,
  ChakraConjs,
  ChakraDateTime,
  ChakraFieldSelect,
  ChakraMultiSelect,
  ChakraNumber,
  ChakraSelect,
  ChakraText,
} from '../components/widgets/chakra';
import { useApiClients } from '../../../../lib/contexts/api-client-contexts';
import { useHaloCaches } from '../../../../lib/contexts/halo-caches-context';
import { useFocusPlayer } from '../../../../lib/contexts/focus-player-context';
import { waypointXboxRequestPolicy } from '../../../../lib/requestPolicy';

type HaloQueryFields = {
  [key in ColumnName]?: Field;
};

export function useConfig() {
  const { focusPlayer: focusGamertag } = useFocusPlayer();
  const { haloInfiniteClient } = useApiClients();
  const { playlistCache, playlistVersionCache } = useHaloCaches();
  return useMemo(() => {
    const serviceRecordPromise = focusGamertag
      ? waypointXboxRequestPolicy.execute((ctx) =>
          haloInfiniteClient.getUserServiceRecord(focusGamertag, undefined, {
            signal: ctx.signal,
          })
        )
      : new Promise<ServiceRecord>(() => {
          /* never resolve */
        });
    const queryConfig: Config = {
      ...BasicConfig,
      fields: {
        ...Object.fromEntries(
          Object.entries(columns).map(([key, column]) => [
            key,
            {
              type:
                'type' in column
                  ? column.type
                  : 'cellProps' in column && column.cellProps?.isNumeric
                  ? 'number'
                  : 'text',
              valueSources: ['value'],
              fieldSettings:
                'fieldSettings' in column ? column.fieldSettings : undefined,
              excludeOperators:
                'excludeOperators' in column
                  ? column.excludeOperators
                  : 'cellProps' in column && column.cellProps?.isNumeric
                  ? []
                  : ['is_empty', 'is_not_empty', 'is_null', 'is_not_null'],
            },
          ])
        ),
        'Start Time': {
          type: 'datetime',
          valueSources: ['value'],
          excludeOperators: [
            'is_empty',
            'is_not_empty',
            'is_null',
            'is_not_null',
            'is_blank',
            'is_not_blank',
          ],
        },
        Playlist: {
          type: 'select',
          valueSources: ['value'],
          fieldSettings: {
            asyncFetch: async () => {
              const serviceRecord = await serviceRecordPromise;
              const playlists = await Promise.all(
                (serviceRecord?.Subqueries.PlaylistAssetIds ?? [])
                  .filter((id) => !!id)
                  .map(async (playlistId) => {
                    try {
                      const playlist = await playlistCache.get(playlistId);
                      return playlistVersionCache.get({
                        AssetId: playlistId,
                        VersionId: playlist.UgcPlaylistVersion,
                      });
                    } catch (e) {
                      console.error(e);
                      return null;
                    }
                  })
              );
              return {
                values: playlists
                  .filter((v) => v != null)
                  .map((playlist) => ({
                    value:
                      'PublicName' in playlist
                        ? playlist.PublicName
                        : playlist.AssetId,
                  }))
                  .sortBy((v) => v.value),
              };
            },
          },
        },
        'Game Variant Category': {
          type: 'select',
          valueSources: ['value'],
          fieldSettings: {
            asyncFetch: async () => {
              const serviceRecord = await serviceRecordPromise;
              return {
                values: serviceRecord.Subqueries.GameVariantCategories.map(
                  (gameVariantCategory) =>
                    ({
                      title: GameVariantCategoryDisplay({
                        gameVariantCategory,
                      }),
                      value: gameVariantCategory,
                    } satisfies ListItem)
                ).sortBy((v) => v.title),
              };
            },
          },
          excludeOperators: [
            'is_empty',
            'is_not_empty',
            'is_null',
            'is_not_null',
          ],
        },
        Season: {
          type: 'select',
          valueSources: ['value'],
          fieldSettings: {
            asyncFetch: async () => {
              const serviceRecord = await serviceRecordPromise;
              return {
                values: serviceRecord.Subqueries.SeasonIds.map((season) => ({
                  value: season,
                })),
              };
            },
          },
        },
        Outcome: {
          type: 'select',
          valueSources: ['value'],
          fieldSettings: {
            listValues: [
              MatchOutcome.Win,
              MatchOutcome.Loss,
              MatchOutcome.Tie,
              MatchOutcome.DidNotFinish,
            ].map((v) => ({
              value: v,
              title: OutcomeDisplay({ outcome: v }),
            })),
          },
        },
        ...Object.fromEntries(
          [
            'Duration',
            'Team Oddball - Longest Carry Time',
            'Player Oddball - Longest Carry Time',
            'Team Oddball - Carry Time',
            'Player Oddball - Carry Time',
            'Team CTF - Time as Carrier',
            'Player CTF - Time as Carrier',
            'Team KOTH - Occupation Time',
            'Player KOTH - Occupation Time',
            'Team Strongholds - Occupation Time',
            'Player Strongholds - Occupation Time',
          ].map((key) => [key, { type: 'disabled' }])
        ),
      } satisfies HaloQueryFields & Fields,
      operators,
      ctx: {
        ...BasicConfig.ctx,
        W: {
          ...BasicConfig.ctx.W,
          VanillaButton: ChakraButton,
          VanillaSelectWidget: ChakraSelect,
          VanillaFieldSelect: ChakraFieldSelect,
          VanillaConjs: ChakraConjs,
          VanillaButtonGroup: ChakraButtonGroup,
          VanillaTextWidget: ChakraText,
          VanillaNumberWidget: ChakraNumber,
          VanillaDateTimeWidget: ChakraDateTime,
          VanillaMultiSelectWidget: ChakraMultiSelect,
        },
      },
    };

    delete queryConfig.operators['proximity'];
    return queryConfig;
  }, [focusGamertag]);
}

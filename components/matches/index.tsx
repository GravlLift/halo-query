'use client';
import { Box, Button, Flex, Spacer } from '@chakra-ui/react';
import '@gravllift/utilities';
import type { JsonLogicTree } from '@react-awesome-query-builder/ui';
import { Utils as QbUtils } from '@react-awesome-query-builder/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { bufferTime, filter, map } from 'rxjs';
import { useLocalStorage } from '../../lib/hooks/local-storage';
import { useObservable } from '../../lib/hooks/use-observable';
import { Preset, useColumns } from '../columns';
import { columns as allColumns } from '../columns/base-columns';
import { defaultPageSize } from './default-page-size';
import MatchesHeader from './matches-header';
import MatchesPageNavigation from './matches-page-navigation';
import MatchesTable from './matches-table';
import { useQueryBuilder } from './query-builder';
import { useMatchesQuery } from './use-matches';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';

// No object references allowed
export interface MatchesProps {
  gamerTags: string;
  page: number;
  filters: string | undefined;
  columns: bigint | Preset | undefined;
  pageSize: number | undefined;
}

export default function Matches({
  gamerTags: gamerTags,
  page,
  filters: filtersJSON,
  columns,
  pageSize,
}: MatchesProps) {
  const router = useRouter();
  const contextGamertag = useMemo(
    () => gamerTags.split(',')?.map((g) => g.trim()),
    [gamerTags]
  );
  const { setFocusPlayer } = useFocusPlayer();
  useEffect(() => {
    setFocusPlayer(contextGamertag[0]);
  }, [contextGamertag, setFocusPlayer]);

  const filters: JsonLogicTree | undefined = useMemo(() => {
    if (filtersJSON) {
      try {
        return JSON.parse(filtersJSON);
      } catch (e) {
        return undefined;
      }
    } else {
      return undefined;
    }
  }, [filtersJSON]);

  const [savedPageSize, setPageSize, localStorageReadComplete] =
    useLocalStorage('matches.pageSize', pageSize || defaultPageSize);

  const useColumnsProps = useColumns(columns);
  const {
    matches,
    loading,
    runQuery,
    abortController,
    logger$,
    queryPageSize,
  } = useMatchesQuery(contextGamertag);
  const log = useObservable(
    logger$?.pipe(
      bufferTime(200),
      filter((logs) => logs.length > 0),
      map((logs) => logs[logs.length - 1])
    ),
    ''
  );
  const queryBuilder = useQueryBuilder(filters);
  const jsonLogicResult = useMemo(
    () =>
      QbUtils.jsonLogicFormat(
        queryBuilder.queryState.tree,
        queryBuilder.queryState.config
      ),
    [queryBuilder.queryState.tree, queryBuilder.queryState.config]
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('page');

    if (savedPageSize === defaultPageSize) {
      url.searchParams.delete('pageSize');
    } else {
      url.searchParams.set('pageSize', savedPageSize.toString());
    }

    if (useColumnsProps.columnPreset === Preset.Default) {
      url.searchParams.delete('columns');
    } else if (useColumnsProps.columnPreset === 'Custom') {
      url.searchParams.set(
        'columns',
        Object.values(allColumns)
          .reduce(
            (previous, current) =>
              useColumnsProps.visibleColumns.includes(current)
                ? previous | (1n << BigInt(current.id))
                : previous,
            0n
          )
          .toString(10)
      );
    } else {
      url.searchParams.set('columns', useColumnsProps.columnPreset);
    }

    if (jsonLogicResult.logic) {
      url.searchParams.set('filters', JSON.stringify(jsonLogicResult.logic));
    } else {
      url.searchParams.delete('filters');
    }

    if (url.href !== window.location.href) {
      router.replace(url.href);
    }
  }, [
    jsonLogicResult.logic,
    router,
    savedPageSize,
    useColumnsProps.columnPreset,
    useColumnsProps.visibleColumns,
  ]);

  const [showRawValues, setShowRawValues] = useState(false);

  useEffect(() => {
    if (!localStorageReadComplete) {
      return;
    }
    runQuery(page, savedPageSize, filters, useColumnsProps.visibleColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runQuery, page, localStorageReadComplete]);

  const [flattenHeaderRows, setFlattenHeaderRows] = useState(false);
  return (
    <>
      <MatchesHeader
        queryBuilder={queryBuilder}
        useColumnsProps={useColumnsProps}
        options={{
          showRawValues,
          setShowRawValues,
          pageSize: savedPageSize,
          setPageSize: (val) => {
            abortController?.abort();
            setPageSize(val);
          },
          flattenHeaderRows: {
            value: flattenHeaderRows,
            setValue: setFlattenHeaderRows,
          },
        }}
      />
      <Flex justifyContent="space-between" p={2} width="100%">
        <Flex flexDir="column">
          <Spacer />
          <pre style={{ whiteSpace: 'pre-wrap' }}>{log}</pre>
          <Spacer />
        </Flex>
        <Flex flexDir="column">
          <Spacer />
          <Box>
            {loading ? (
              <Button
                width="150px"
                colorPalette="red"
                onClick={() => {
                  abortController?.abort();
                }}
              >
                Cancel
              </Button>
            ) : (
              <Button
                width="150px"
                colorPalette="green"
                disabled={
                  jsonLogicResult.errors && jsonLogicResult.errors.length > 0
                }
                onClick={async () => {
                  abortController?.abort();
                  const { immutableTree, config } =
                    await queryBuilder.getFilter();
                  const jsonLogicTree = QbUtils.jsonLogicFormat(
                    immutableTree,
                    config
                  );
                  if (jsonLogicTree.errors?.length) {
                    return;
                  }

                  await runQuery(
                    page,
                    pageSize || defaultPageSize,
                    jsonLogicTree.logic,
                    useColumnsProps.visibleColumns
                  );
                }}
              >
                Execute Query
              </Button>
            )}
          </Box>
          <Spacer />
        </Flex>
      </Flex>
      <Box mb={2}>
        <MatchesTable
          contextGamertag={contextGamertag}
          visibleColumns={useColumnsProps.visibleColumns}
          matches={matches}
          pageSize={queryPageSize || defaultPageSize}
          loading={loading}
          showRawValues={showRawValues}
          filtersJSON={filtersJSON}
          flattenHeaderRows={flattenHeaderRows}
        />
      </Box>
      <MatchesPageNavigation
        contextGamertag={contextGamertag}
        page={page}
        filtersJSON={filtersJSON}
        matchesCount={matches.length}
        pageSize={queryPageSize || defaultPageSize}
        columns={columns}
      />
    </>
  );
}

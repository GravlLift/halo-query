'use client';
import { DownloadIcon, CircleHelp } from 'lucide-react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Link,
  Table,
  Text,
  TableCellProps,
} from '@chakra-ui/react';
import '@gravllift/utilities';
import { compareXuids } from '@gravllift/halo-helpers';
import NextLink from 'next/link';
import React, { Fragment, useRef } from 'react';
import { appInsights } from '../../lib/application-insights/client';
import { PlayerMatchHistoryStatsSkill } from '@gravllift/halo-helpers';
import { UseColumnsProps } from '../columns';
import { categories, orderedColumns } from '../columns/base-columns';
import { RowParameters } from '../columns/types';
import TableLoading from '../table-loading';
import { Tooltip } from '../ui/tooltip';

function getRowsForCsv(
  rows: NodeListOf<HTMLTableRowElement>,
  cellType: 'th' | 'td'
) {
  const maxRowLength = Math.max(
    ...Array.from(rows).map((r) => {
      return Array.from(
        r.querySelectorAll<HTMLTableCellElement>(`:scope > ${cellType}`)
      ).sum((cell) => cell.colSpan || 1);
    })
  );

  const cellMap = Array.from(rows).map(() =>
    new Array<HTMLTableCellElement | null>(maxRowLength).fill(null)
  );
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells = row.querySelectorAll<HTMLTableCellElement>(
      `:scope > ${cellType}`
    );
    const minRowSpan = Math.min(
      ...Array.from(cells).map((c) => c.rowSpan || 1)
    );
    let cellCursor = 0;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex];
      while (cellMap[rowIndex][cellCursor] != null) {
        cellCursor++;
      }
      cellMap[rowIndex][cellCursor] = cell;
      if (cell.rowSpan > minRowSpan) {
        for (let i = minRowSpan; i < cell.rowSpan; i++) {
          cellMap[rowIndex + i][cellCursor] = cell;
        }
      }
      if (cell.colSpan > 1) {
        for (let i = 1; i < cell.colSpan; i++) {
          cellMap[rowIndex][cellCursor + i] = cell;
        }
      }

      cellCursor += (cell.colSpan || 1) - 1;
    }
  }

  return cellMap.map((cells) =>
    cells
      .slice(1)
      .map((cell) => getCellCsvFormattedText(cell))
      .join(',')
  );
}

export default function MatchesTable({
  visibleColumns,
  matches,
  loading,
  pageSize,
  showRawValues,
  contextGamertag,
  filtersJSON,
  flattenHeaderRows,
}: {
  visibleColumns: UseColumnsProps['visibleColumns'];
  matches: PlayerMatchHistoryStatsSkill[];
  loading: boolean;
  pageSize: number;
  showRawValues: boolean;
  contextGamertag: string[];
  filtersJSON: string | undefined;
  flattenHeaderRows: boolean;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  return (
    <>
      {loading ? null : (
        <Flex justifyContent="right" p={2}>
          <Box>
            <Button
              variant="plain"
              onClick={() => {
                if (!tableRef.current) return;

                const rows =
                  tableRef.current.querySelectorAll<HTMLTableRowElement>(
                    ':scope > thead > tr'
                  );
                const maxRowLength = Math.max(
                  ...Array.from(rows).map((r) => {
                    return Array.from(
                      r.querySelectorAll<HTMLTableCellElement>(':scope > th')
                    ).sum((cell) => cell.colSpan || 1);
                  })
                );

                const cellMap = Array.from(rows).map(() =>
                  new Array<HTMLTableCellElement | null>(maxRowLength).fill(
                    null
                  )
                );
                for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                  const row = rows[rowIndex];
                  const cells =
                    row.querySelectorAll<HTMLTableCellElement>(':scope > th');
                  let cellCursor = 0;
                  for (
                    let cellIndex = 0;
                    cellIndex < cells.length;
                    cellIndex++
                  ) {
                    const cell = cells[cellIndex];
                    while (cellMap[rowIndex][cellCursor] != null) {
                      cellCursor++;
                    }
                    cellMap[rowIndex][cellCursor] = cell;
                    if (cell.rowSpan > 1) {
                      for (let i = 1; i < cell.rowSpan; i++) {
                        cellMap[rowIndex + i][cellCursor] = cell;
                      }
                    }
                    if (cell.colSpan > 1) {
                      for (let i = 1; i < cell.colSpan; i++) {
                        cellMap[rowIndex][cellCursor + i] = cell;
                      }
                    }

                    cellCursor += (cell.colSpan || 1) - 1;
                  }
                }

                let tableHeaderRowsCsv = getRowsForCsv(rows, 'th');
                if (flattenHeaderRows) {
                  const allHeaderCells = tableHeaderRowsCsv.map((row) =>
                    row.split(',')
                  );
                  tableHeaderRowsCsv = [
                    allHeaderCells[0]
                      .map((_, i) =>
                        allHeaderCells
                          .map((row) => row[i])
                          .filter((cell) => cell !== '')
                          .join(': ')
                      )
                      .join(','),
                  ];
                }

                const tableBodyRowsCsv = getRowsForCsv(
                  tableRef.current.querySelectorAll(':scope > tbody > tr'),
                  'td'
                );

                const blob = new Blob(
                  [tableHeaderRowsCsv.concat(tableBodyRowsCsv).join('\n')],
                  { type: 'text/csv' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Halo Query - ${contextGamertag.join(',')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <DownloadIcon />
              <Text hideBelow="md">Download as CSV</Text>
            </Button>
          </Box>
        </Flex>
      )}
      <Table.ScrollArea>
        <Table.Root
          variant={'line'}
          showColumnBorder
          size={'sm'}
          ref={tableRef}
        >
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader rowSpan={3}></Table.ColumnHeader>
              {categories.map((topLevelCategory, i) => {
                const visibleGrandchildrenCount = topLevelCategory.children.sum(
                  (secondLevelCategory) =>
                    secondLevelCategory.children.count((c) =>
                      visibleColumns.includes(
                        c as (typeof visibleColumns)[number]
                      )
                    )
                );
                if (visibleGrandchildrenCount > 0) {
                  return (
                    <Table.ColumnHeader
                      key={i}
                      colSpan={visibleGrandchildrenCount}
                    >
                      {topLevelCategory.text}
                    </Table.ColumnHeader>
                  );
                } else {
                  return <Fragment key={i}></Fragment>;
                }
              })}
            </Table.Row>
            <Table.Row>
              {categories.flatMap((topLevelCategory, i) =>
                topLevelCategory.children.map((secondLevelCategory, j) => {
                  const visibleChildrenCount =
                    secondLevelCategory.children.count((c) =>
                      visibleColumns.includes(
                        c as (typeof visibleColumns)[number]
                      )
                    );
                  if (visibleChildrenCount > 0) {
                    return (
                      <Table.ColumnHeader
                        key={`${i}_${j}`}
                        colSpan={visibleChildrenCount}
                      >
                        {secondLevelCategory.text}
                      </Table.ColumnHeader>
                    );
                  } else {
                    return <Fragment key={`${i}_${j}`}></Fragment>;
                  }
                })
              )}
            </Table.Row>
            <Table.Row>
              {orderedColumns.map((tableColumn, i) => {
                if (
                  visibleColumns.includes(
                    tableColumn as (typeof visibleColumns)[number]
                  ) === false
                )
                  return <Fragment key={i}></Fragment>;
                return (
                  <Table.ColumnHeader key={i}>
                    <HStack>
                      {tableColumn.tooltip ? (
                        <Tooltip content={tableColumn.tooltip}>
                          <HStack>
                            <Box>{tableColumn.text}</Box>
                            <CircleHelp />
                          </HStack>
                        </Tooltip>
                      ) : (
                        <Box>{tableColumn.text}</Box>
                      )}
                    </HStack>
                  </Table.ColumnHeader>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {matches
              ?.sortByDesc((m) => m.MatchInfo.EndTime)
              .flatMap((match) => {
                return match.Players.sortBy((p) => p.gamertag).map(
                  (player, i, { length }) => {
                    const playerWithStats = {
                      ...player,
                      ...match.MatchStats.Players.find((p) =>
                        compareXuids(p.PlayerId, player.xuid)
                      ),
                    } as RowParameters['player'];
                    const teamWithPlayers = {
                      TeamId: playerWithStats.LastTeamId,
                      ...match.MatchStats.Teams.find(
                        (t) => t.TeamId === playerWithStats.LastTeamId
                      ),
                      Players: match.MatchStats.Players.filter(
                        (p) => p.LastTeamId === playerWithStats.LastTeamId
                      ).map((p) => ({
                        ...match.Players.find((p2) =>
                          compareXuids(p.PlayerId, p2.xuid)
                        ),
                        ...p,
                      })),
                    } as RowParameters['team'];

                    return (
                      <Table.Row key={match.MatchId + '+' + player.gamertag}>
                        <TdRowSpan textAlign={'center'} level={'Match'}>
                          <Link asChild>
                            <NextLink
                              href={`/matches/${match.MatchId}${
                                filtersJSON ? `?filters=${filtersJSON}` : ''
                              }`}
                              prefetch={false}
                            >
                              More Details
                            </NextLink>
                          </Link>
                        </TdRowSpan>
                        {orderedColumns.map((tableColumn, i) => {
                          if (
                            visibleColumns.includes(
                              tableColumn as (typeof visibleColumns)[number]
                            ) === false
                          )
                            return <Fragment key={i}></Fragment>;

                          if (
                            tableColumn.gameVariantSpecific != null &&
                            tableColumn.gameVariantSpecific !=
                              match.MatchInfo.GameVariantCategory
                          )
                            return (
                              <TdRowSpan
                                key={i}
                                level={tableColumn.level}
                              ></TdRowSpan>
                            );

                          let contents: React.ReactNode;
                          let isNumeric: boolean | undefined =
                            tableColumn.cellProps?.textAlign === 'right';
                          if (!showRawValues && 'format' in tableColumn) {
                            const rawValue = tableColumn.rawValue({
                              match,
                              team: teamWithPlayers,
                              player: playerWithStats,
                            });
                            try {
                              contents = tableColumn.format(rawValue, {
                                match,
                                team: teamWithPlayers,
                                player: playerWithStats,
                              });
                            } catch (e) {
                              console.error(e);
                              appInsights.trackException({
                                exception: e as Error,
                                properties: {
                                  rawValue,
                                  tableColumn,
                                  match,
                                  teamWithPlayers,
                                  playerWithStats,
                                },
                              });
                              contents = rawValue;
                            }
                          } else {
                            contents = tableColumn.rawValue({
                              match,
                              team: teamWithPlayers,
                              player: playerWithStats,
                            });
                            isNumeric =
                              isNumeric == null && typeof contents === 'number';
                          }
                          return (
                            <TdRowSpan
                              key={i}
                              textAlign={isNumeric ? 'right' : undefined}
                              level={tableColumn.level}
                            >
                              {contents}
                            </TdRowSpan>
                          );
                        })}
                      </Table.Row>
                    );

                    function TdRowSpan(
                      props: {
                        level: 'Player' | 'Match' | 'Team';
                        children?: React.ReactNode;
                      } & TableCellProps
                    ) {
                      if (props.level === 'Player') {
                        return (
                          <Table.Cell {...props}>{props.children}</Table.Cell>
                        );
                      } else {
                        return i === 0 ? (
                          <Table.Cell rowSpan={length} {...props}>
                            {props.children}
                          </Table.Cell>
                        ) : null;
                      }
                    }
                  }
                );
              })}
            {loading ? (
              <TableLoading
                rows={Math.min(25, Math.max(pageSize - matches.length, 1))}
                columns={visibleColumns.length + 1}
              />
            ) : null}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </>
  );
}

function getCellCsvFormattedText(cell: HTMLTableCellElement | null) {
  if (cell == null) {
    throw new Error('Cell is null');
  }

  if (
    cell.innerText.includes(',') ||
    cell.innerText.includes('"') ||
    cell.innerText.includes('\n') ||
    cell.innerText.includes('\r')
  ) {
    return `"${cell.innerText.replace(/"/g, '""')}"`;
  }
  return cell.innerText;
}

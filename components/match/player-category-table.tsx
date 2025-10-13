import { Table } from '@chakra-ui/react';
import {
  compareXuids,
  MatchPlayers,
  PlayerMatchHistoryStatsSkill,
  ProgressiveMatch,
} from '@gravllift/halo-helpers';
import { teamNames } from '../../lib/team-names';
import { categories } from '../columns/base-columns';
import { RowParameters, TableColumn } from '../columns/types';
import GamertagDisplay from './gamertag-display';
import { RefObject } from 'react';

function mapTableCell(
  c2: TableColumn,
  i: number,
  i2: number,
  match: PlayerMatchHistoryStatsSkill | ProgressiveMatch,
  teamWithPlayers: RowParameters['team'],
  p: RowParameters['player']
) {
  let contents: React.ReactNode = c2.rawValue({
    match,
    team: teamWithPlayers,
    player: p,
  });
  const isNumeric: boolean = typeof contents === 'number';
  if ('format' in c2) {
    contents = c2.format(contents, {
      match,
      team: teamWithPlayers,
      player: p,
    });
  }
  return (
    <Table.Cell key={`${i}-${i2}`} textAlign={isNumeric ? 'right' : undefined}>
      {contents}
    </Table.Cell>
  );
}

export default function PlayerCategoryTable({
  match,
  category,
  playersByTeam,
  teamPresets,
  fileHandleRef,
}: {
  category: (typeof categories)[number];
  match: PlayerMatchHistoryStatsSkill | ProgressiveMatch;
  playersByTeam: Array<[number, MatchPlayers]> | undefined;
  teamPresets: { color: string }[];
  fileHandleRef: RefObject<FileSystemFileHandle | null>;
}) {
  const matchStats = 'MatchStats' in match ? match.MatchStats : match;
  return (
    <Table.ScrollArea>
      <Table.Root variant={'line'} showColumnBorder size={'sm'}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader rowSpan={2}></Table.ColumnHeader>
            {category.children
              .filter(
                (c) =>
                  c.children.count(
                    (c2) =>
                      c2.gameVariantSpecific == null ||
                      c2.gameVariantSpecific ===
                        match.MatchInfo.GameVariantCategory
                  ) > 0
              )
              .map((c, i) => (
                <Table.ColumnHeader
                  key={i}
                  colSpan={c.children.count(
                    (c) =>
                      c.gameVariantSpecific == null ||
                      c.gameVariantSpecific ===
                        match.MatchInfo.GameVariantCategory
                  )}
                >
                  {c.text}
                </Table.ColumnHeader>
              ))}
          </Table.Row>
          <Table.Row>
            {category.children.flatMap((c, i) =>
              c.children
                .filter(
                  (c) =>
                    c.gameVariantSpecific == null ||
                    c.gameVariantSpecific ===
                      match.MatchInfo.GameVariantCategory
                )
                .map((c2, i2) => (
                  <Table.ColumnHeader key={`${i}-${i2}`} title={c2.tooltip}>
                    {c2.text}
                  </Table.ColumnHeader>
                ))
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {playersByTeam
            ?.sortBy(([teamId, players]) =>
              match.MatchInfo.TeamsEnabled
                ? matchStats?.Teams.find((t) => t.TeamId === teamId)?.Rank ??
                  Number.MAX_SAFE_INTEGER
                : players[0].Rank
            )
            .map(([teamId, players]) => {
              const teamWithPlayers = {
                TeamId: teamId,
                ...matchStats?.Teams.find((t) => t.TeamId === teamId),
                Players: matchStats?.Players.filter(
                  (p) => p.LastTeamId === teamId
                ).map((p) => ({
                  ...match.Players.find((p2) =>
                    compareXuids(
                      p.PlayerId,
                      'PlayerId' in p2 ? p2.PlayerId : p2.xuid
                    )
                  ),
                  ...p,
                })),
              } as RowParameters['team'];
              const tableRows = players
                .sortByDesc(
                  (p) =>
                    p.PlayerTeamStats.find((t) => t.TeamId === teamId)?.Stats
                      .CoreStats.PersonalScore ?? 0
                )
                .map((p) => (
                  <Table.Row
                    key={p.PlayerId}
                    backgroundColor={
                      match.MatchInfo.TeamsEnabled
                        ? teamPresets[teamId]?.color
                        : undefined
                    }
                  >
                    <Table.Cell>
                      <GamertagDisplay
                        player={p}
                        matchId={match.MatchId}
                        fileHandleRef={fileHandleRef}
                      />
                    </Table.Cell>
                    {category.children.flatMap((c, i) =>
                      c.children
                        .filter(
                          (c) =>
                            c.gameVariantSpecific == null ||
                            c.gameVariantSpecific ===
                              match.MatchInfo.GameVariantCategory
                        )
                        .map((c2, i2) =>
                          mapTableCell(c2, i, i2, match, teamWithPlayers, p)
                        )
                    )}
                  </Table.Row>
                ));
              if (match.MatchInfo.TeamsEnabled) {
                tableRows.push(
                  <Table.Row
                    key={teamId}
                    backgroundColor={teamPresets[teamId]?.color}
                    fontWeight="bold"
                  >
                    <Table.Cell>{teamNames[teamId]}</Table.Cell>
                    {categories[1].children.flatMap((c, i) =>
                      c.children
                        .filter(
                          (c) =>
                            c.gameVariantSpecific == null ||
                            c.gameVariantSpecific ===
                              match.MatchInfo.GameVariantCategory
                        )
                        .map((c2, i2) =>
                          mapTableCell(
                            c2,
                            i,
                            i2,
                            match,
                            teamWithPlayers,
                            {} as RowParameters['player']
                          )
                        )
                    )}
                  </Table.Row>
                );
              }
              return tableRows;
            })}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}

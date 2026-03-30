import { Table } from '@chakra-ui/react';
import { MatchOutcome, MatchSkill } from 'halo-infinite-api';
import { skillRank } from '@gravllift/halo-helpers';
import { Duration } from 'luxon';
import { useEffect, useState } from 'react';
import { PerformanceSkillCell } from './performance-skill-cell';
import { WinRateCell } from './win-rate-cell';

export function GameTypeTable({
  matches,
  playlistName,
  CellType,
  performanceSkillType,
}: {
  playlistName: string;
  matches: {
    outcome: MatchOutcome | undefined;
    mapName: string;
    gameVariantName: string;
    playerSkill: MatchSkill<1 | 0> | undefined;
    playerDuration: Duration;
  }[];
  CellType: typeof WinRateCell | typeof PerformanceSkillCell;
  performanceSkillType: 'Kills' | 'Deaths';
}) {
  const filteredMatches = matches.filter((m) =>
    [MatchOutcome.Win, MatchOutcome.Loss, MatchOutcome.Tie].includes(
      m.outcome as MatchOutcome,
    ),
  );
  const gameVariants = filteredMatches
    .map((m) => m.gameVariantName)
    .distinct()
    .sortBy();
  const maps = filteredMatches
    .map((m) => m.mapName)
    .distinct()
    .sortBy();
  const matchAggregateByGameVariant = matches.groupBy((m) => m.gameVariantName);
  const matchAggregateByMap = matches.groupBy((m) => m.mapName);
  const matchAggregateByGameVariantAndMap = matches.groupBy(
    (m) => `${m.gameVariantName}_${m.mapName}`,
  );
  const getCellPsr = (
    groupedMatches:
      | {
          playerDuration: Duration;
          playerSkill: MatchSkill<1 | 0> | undefined;
        }[]
      | undefined,
  ): number | undefined => {
    if (!groupedMatches?.length) {
      return undefined;
    }

    const values: number[] = [];
    const weights: number[] = [];
    for (const m of groupedMatches) {
      const maybePsr = m.playerSkill
        ? skillRank(m.playerSkill, performanceSkillType, 'Count')
        : undefined;
      if (maybePsr != null) {
        values.push(maybePsr);
        weights.push(m.playerDuration.toMillis());
      }
    }

    return values.length ? values.weightedAverage(weights) : undefined;
  };
  const allSkillValues = [
    ...Array.from(matchAggregateByGameVariantAndMap.values()).map(getCellPsr),
    ...Array.from(matchAggregateByMap.values()).map(getCellPsr),
    ...Array.from(matchAggregateByGameVariant.values()).map(getCellPsr),
    gameVariants.length > 1 && maps.length > 1
      ? getCellPsr(filteredMatches)
      : undefined,
  ].filter((v): v is number => v != null);
  const tableSkillMin = allSkillValues.length
    ? Math.min(...allSkillValues)
    : undefined;
  const tableSkillMax = allSkillValues.length
    ? Math.max(...allSkillValues)
    : undefined;

  return (
    <Table.Root size="sm">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader></Table.ColumnHeader>
          {gameVariants.map((gameVariant) => (
            <Table.ColumnHeader key={gameVariant} textAlign="center">
              {gameVariant}
            </Table.ColumnHeader>
          ))}
          {gameVariants.length > 1 ? (
            <Table.ColumnHeader textAlign="center">Total</Table.ColumnHeader>
          ) : (
            <></>
          )}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {maps.map((map) => (
          <Table.Row key={map}>
            <Table.ColumnHeader>{map}</Table.ColumnHeader>
            {gameVariants.map((gameVariant) => {
              const matches = matchAggregateByGameVariantAndMap.get(
                `${gameVariant}_${map}`,
              );
              return (
                <CellType
                  key={gameVariant}
                  matches={matches}
                  CellType={Table.Cell}
                  playlistName={playlistName}
                  mapName={map}
                  gameVariantName={gameVariant}
                  skillType={performanceSkillType}
                  tableSkillMin={tableSkillMin}
                  tableSkillMax={tableSkillMax}
                />
              );
            })}
            {gameVariants.length > 1 ? (
              <CellType
                matches={matchAggregateByMap.get(map)}
                CellType={Table.Cell}
                playlistName={playlistName}
                mapName={map}
                gameVariantName={null}
                skillType={performanceSkillType}
                tableSkillMin={tableSkillMin}
                tableSkillMax={tableSkillMax}
              />
            ) : (
              <></>
            )}
          </Table.Row>
        ))}
        {maps.length > 1 ? (
          <Table.Row>
            <Table.ColumnHeader>Total</Table.ColumnHeader>
            {gameVariants.map((gameVariant) => {
              const matches = matchAggregateByGameVariant.get(gameVariant);
              return (
                <CellType
                  key={gameVariant}
                  matches={matches}
                  CellType={Table.Cell}
                  playlistName={playlistName}
                  gameVariantName={gameVariant}
                  mapName={null}
                  skillType={performanceSkillType}
                  tableSkillMin={tableSkillMin}
                  tableSkillMax={tableSkillMax}
                />
              );
            })}
            {gameVariants.length > 1 ? (
              <CellType
                matches={filteredMatches}
                CellType={Table.Cell}
                playlistName={playlistName}
                gameVariantName={null}
                mapName={null}
                skillType={performanceSkillType}
                tableSkillMin={tableSkillMin}
                tableSkillMax={tableSkillMax}
              />
            ) : (
              <></>
            )}
          </Table.Row>
        ) : (
          <></>
        )}
      </Table.Body>
    </Table.Root>
  );
}

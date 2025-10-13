import { Table, Link } from '@chakra-ui/react';
import { MatchOutcome } from 'halo-infinite-api';
import { percentFormatter } from '../../lib/formatters';
import NextLink from 'next/link';
import { ColumnName } from '../columns/base-columns';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';

function WinRateCell({
  matches,
  CellType,
  playlistName,
  mapName,
  gameVariantName,
}: {
  playlistName: string;
  mapName: string | null;
  gameVariantName: string | null;
  matches:
    | {
        outcome: MatchOutcome | undefined;
      }[]
    | undefined;
  CellType: typeof Table.Cell | typeof Table.ColumnHeader;
}) {
  const { focusPlayer } = useFocusPlayer();

  if (matches?.length && focusPlayer) {
    const wins = matches?.count((m) => m.outcome === MatchOutcome.Win);
    const losses = matches?.count((m) => m.outcome === MatchOutcome.Loss);
    const ties = matches?.count((m) => m.outcome === MatchOutcome.Tie);
    const winLosses = wins + losses;
    const winRate = winLosses > 0 ? wins / winLosses : 0;
    let color: string | undefined = undefined;
    if (winRate > 2 / 3) {
      color = 'green.500';
    } else if (winRate < 1 / 3) {
      color = 'red.500';
    }
    const filter: {
      and: {
        '==': [
          {
            var: ColumnName;
          },
          string
        ];
      }[];
    } = {
      and: [
        {
          '==': [
            {
              var: 'Playlist',
            },
            playlistName,
          ],
        },
      ],
    };
    if (mapName) {
      filter.and.push({
        '==': [
          {
            var: 'Map',
          },
          mapName,
        ],
      });
    }
    if (gameVariantName) {
      filter.and.push({
        '==': [
          {
            var: 'Game Variant',
          },
          gameVariantName,
        ],
      });
    }
    const urlParams = new URLSearchParams({
      gamertag: focusPlayer,
      filters: JSON.stringify(filter),
    });
    return (
      <CellType
        textAlign="center"
        borderBottomColor={color}
        borderBottomWidth="2px"
      >
        <Link asChild>
          <NextLink href={`/matches?${urlParams}`}>
            {wins}-{losses}
            {ties > 0 ? `-${ties}` : ''} ({percentFormatter.format(winRate)})
          </NextLink>
        </Link>
      </CellType>
    );
  } else {
    return <CellType></CellType>;
  }
}

export function WinRateTable({
  matches,
  playlistName,
}: {
  playlistName: string;
  matches: {
    outcome: MatchOutcome | undefined;
    mapName: string;
    gameVariantName: string;
  }[];
}) {
  const filteredMatches = matches.filter((m) =>
    [MatchOutcome.Win, MatchOutcome.Loss, MatchOutcome.Tie].includes(
      m.outcome as MatchOutcome
    )
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
    (m) => `${m.gameVariantName}_${m.mapName}`
  );

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
                `${gameVariant}_${map}`
              );
              return (
                <WinRateCell
                  key={gameVariant}
                  matches={matches}
                  CellType={Table.Cell}
                  playlistName={playlistName}
                  mapName={map}
                  gameVariantName={gameVariant}
                />
              );
            })}
            {gameVariants.length > 1 ? (
              <WinRateCell
                matches={matchAggregateByMap.get(map)}
                CellType={Table.Cell}
                playlistName={playlistName}
                mapName={map}
                gameVariantName={null}
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
                <WinRateCell
                  key={gameVariant}
                  matches={matches}
                  CellType={Table.Cell}
                  playlistName={playlistName}
                  gameVariantName={gameVariant}
                  mapName={null}
                />
              );
            })}
            {gameVariants.length > 1 ? (
              <WinRateCell
                matches={filteredMatches}
                CellType={Table.Cell}
                playlistName={playlistName}
                gameVariantName={null}
                mapName={null}
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

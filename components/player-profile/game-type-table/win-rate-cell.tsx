import { Link, Table } from '@chakra-ui/react';
import { MatchOutcome } from 'halo-infinite-api';
import NextLink from 'next/link';
import { useFocusPlayer } from '../../../lib/contexts/focus-player-context';
import { percentFormatter } from '../../../lib/formatters';
import { urlParams } from './url-parameters';

export function WinRateCell({
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
    let wins = 0,
      losses = 0,
      ties = 0;
    for (const m of matches) {
      switch (m.outcome) {
        case MatchOutcome.Win:
          wins++;
          break;
        case MatchOutcome.Loss:
          losses++;
          break;
        case MatchOutcome.Tie:
          ties++;
          break;
      }
    }
    const winLosses = wins + losses;
    const winRate = winLosses > 0 ? wins / winLosses : 0;
    let color: string | undefined = undefined;
    if (winRate > 2 / 3) {
      color = 'green.500';
    } else if (winRate < 1 / 3) {
      color = 'red.500';
    }
    return (
      <CellType
        textAlign="center"
        borderBottomColor={color}
        borderBottomWidth="2px"
      >
        <Link asChild>
          <NextLink
            href={`/matches?${urlParams(
              focusPlayer,
              mapName,
              gameVariantName,
              playlistName,
            )}`}
          >
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

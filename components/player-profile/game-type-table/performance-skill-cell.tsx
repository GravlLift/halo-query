import { Link, Table } from '@chakra-ui/react';
import { skillRank } from '@gravllift/halo-helpers';
import { MatchSkill } from 'halo-infinite-api';
import { Duration } from 'luxon';
import NextLink from 'next/link';
import { useFocusPlayer } from '../../../lib/contexts/focus-player-context';
import { urlParams } from './url-parameters';

export function PerformanceSkillCell({
  matches,
  CellType,
  playlistName,
  mapName,
  gameVariantName,
  skillType,
  tableSkillMin,
  tableSkillMax,
}: {
  playlistName: string;
  mapName: string | null;
  gameVariantName: string | null;
  matches:
    | {
        playerDuration: Duration;
        playerSkill: MatchSkill<1 | 0> | undefined;
      }[]
    | undefined;
  CellType: typeof Table.Cell | typeof Table.ColumnHeader;
  skillType: 'Kills' | 'Deaths';
  tableSkillMin: number | undefined;
  tableSkillMax: number | undefined;
}) {
  const { focusPlayer } = useFocusPlayer();

  if (matches?.length && focusPlayer) {
    const psrInputs = {
      values: [] as number[],
      weights: [] as number[],
    };
    for (const m of matches) {
      const matchWeight = m.playerDuration.toMillis();
      const maybePsr = m.playerSkill
        ? skillRank(m.playerSkill, skillType, 'Count')
        : undefined;
      if (maybePsr) {
        psrInputs.values.push(maybePsr);
        psrInputs.weights.push(matchWeight);
      }
    }
    const psr = psrInputs.values.length
      ? psrInputs.values.weightedAverage(psrInputs.weights)
      : undefined;

    let color: string | undefined = undefined;
    if (psr != null && tableSkillMin != null && tableSkillMax != null) {
      const range = tableSkillMax - tableSkillMin;
      if (range > 0 && psr >= tableSkillMin + (2 / 3) * range) {
        color = 'green.500';
      } else if (range > 0 && psr <= tableSkillMin + (1 / 3) * range) {
        color = 'red.500';
      }
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
            {psr?.toFixed(2)}
          </NextLink>
        </Link>
      </CellType>
    );
  } else {
    return <CellType></CellType>;
  }
}

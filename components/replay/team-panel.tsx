import { Flex, Box } from '@chakra-ui/react';
import type { Replay as FilmReplay, ReplayPoint } from '@gravllift/halo-film';
import { PlayerCard } from './player-card';

export function TeamPanel({
  players,
  replay,
  points,
  timeMs,
  color,
  side,
}: {
  players: FilmReplay['players'];
  replay: FilmReplay;
  points: ReplayPoint[];
  timeMs: number;
  color?: string;
  side: 'left' | 'right';
}) {
  return (
    <Flex
      direction="column"
      gap={2}
      flexShrink={0}
      h={0}
      minH="100%"
      overflowY="auto"
    >
      {players.map((p) => (
        <Box key={p.actor} flex="1 1 0" display="flex">
          <PlayerCard
            player={p}
            replay={replay}
            point={points.find((point) => point.actor === p.actor)}
            timeMs={timeMs}
            color={color}
            side={side}
          />
        </Box>
      ))}
    </Flex>
  );
}

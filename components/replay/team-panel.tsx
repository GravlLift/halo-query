import { Flex, Box } from '@chakra-ui/react';
import type { Replay as FilmReplay } from '@gravllift/halo-film';
import { PlayerCard } from './player-card';

export function TeamPanel({
  players,
  replay,
  timeMs,
  color,
  side,
}: {
  players: FilmReplay['players'];
  replay: FilmReplay;
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
            timeMs={timeMs}
            color={color}
            side={side}
          />
        </Box>
      ))}
    </Flex>
  );
}

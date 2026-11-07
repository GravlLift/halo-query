import { Box, Flex, Text } from '@chakra-ui/react';
import type { Replay as FilmReplay, ReplayPoint } from '@gravllift/halo-film';
import { memo } from 'react';

function StatBar({
  value,
  color,
  overColor,
}: {
  value: number;
  color: string;
  overColor?: string;
}) {
  return (
    <Box position="relative" h="6px" bg="blackAlpha.600" borderRadius="sm">
      <Box
        position="absolute"
        inset={0}
        w={`${Math.min(Math.max(value, 0), 1) * 100}%`}
        bg={color}
        borderRadius="sm"
      />
      {overColor && value > 1 && (
        <Box
          position="absolute"
          inset={0}
          w={`${Math.min(value - 1, 1) * 100}%`}
          bg={overColor}
          borderRadius="sm"
        />
      )}
    </Box>
  );
}

function Chip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Flex
      direction="column"
      align="center"
      flex={1}
      bg={color}
      borderRadius="sm"
      py="1px"
    >
      <Text fontSize="2xs" lineHeight={1} opacity={0.8}>
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="bold" lineHeight={1.2}>
        {value}
      </Text>
    </Flex>
  );
}

export function PlayerCard({
  player,
  replay,
  point,
  timeMs,
  color,
  side = 'left',
}: {
  player: FilmReplay['players'][number];
  replay: FilmReplay;
  point?: ReplayPoint;
  timeMs: number;
  color?: string;
  side?: 'left' | 'right';
}) {
  const status = replay.status(player.actor, timeMs);
  const loadout = replay.loadout(player.actor, timeMs);
  return (
    <PlayerCardContent
      player={player}
      point={point}
      status={status}
      loadout={loadout}
      color={color}
      side={side}
    />
  );
}

const PlayerCardContent = memo(
  function PlayerCardContent({
    player,
    point,
    status,
    loadout,
    color,
    side,
  }: {
    player: FilmReplay['players'][number];
    point?: ReplayPoint;
    status: ReturnType<FilmReplay['status']>;
    loadout: ReturnType<FilmReplay['loadout']>;
    color?: string;
    side: 'left' | 'right';
  }) {
    const alive = status?.alive ?? false;
    return (
      <Box
        position="relative"
        w="200px"
        p={2}
        borderRadius="md"
        borderLeftWidth={side === 'left' ? '4px' : undefined}
        borderLeftColor={side === 'left' ? color : undefined}
        borderRightWidth={side === 'right' ? '4px' : undefined}
        borderRightColor={side === 'right' ? color : undefined}
        bg="blackAlpha.700"
        color="white"
        overflow="hidden"
      >
        <Text
          fontWeight="bold"
          fontSize="sm"
          lineClamp={1}
          mb={1}
          textAlign={side}
        >
          {player.gamertag ?? `Player ${player.actor + 1}`}
        </Text>
        <Flex gap={1} mb={1} fontVariantNumeric="tabular-nums">
          <Chip
            label="SCORE"
            value={status?.stats?.score ?? 0}
            color="gray.700"
          />
          <Chip label="K" value={status?.stats?.kills ?? 0} color="red.700" />
          <Chip
            label="D"
            value={status?.stats?.deaths ?? 0}
            color="green.700"
          />
          <Chip
            label="A"
            value={status?.stats?.assists ?? 0}
            color="blue.700"
          />
        </Flex>
        <Flex direction="column" gap="3px">
          <StatBar
            value={alive ? (point?.shield ?? 1) : 0}
            color="#38bdf8"
            overColor="#c084fc"
          />
          <StatBar value={alive ? (point?.health ?? 1) : 0} color="#4ade80" />
        </Flex>
        {loadout && (
          <Box mt={1} fontSize="xs" lineHeight={1.3}>
            <Flex justify="space-between" gap={1}>
              <Text lineClamp={1}>{loadout.weapon ?? 'Unknown weapon'}</Text>
              <Text fontVariantNumeric="tabular-nums" flexShrink={0}>
                {!loadout.ammoKnown
                  ? '—'
                  : loadout.chargeLeft !== undefined
                    ? `${Math.round(loadout.chargeLeft * 100)}%`
                    : `${loadout.mag ?? 'Full'} / ${loadout.reserve ?? 0}`}
              </Text>
            </Flex>
            {loadout.holstered && (
              <Flex justify="space-between" gap={1} opacity={0.6}>
                <Text lineClamp={1}>{loadout.holstered.weapon}</Text>
                <Text fontVariantNumeric="tabular-nums" flexShrink={0}>
                  {`${loadout.holstered.mag ?? 'Full'} / ${loadout.holstered.reserve ?? 0}`}
                </Text>
              </Flex>
            )}
            <Flex justify="space-between" gap={1} opacity={0.85}>
              <Text lineClamp={1}>
                {loadout.grenades.length === 0
                  ? 'No grenades'
                  : loadout.grenades
                      .map(
                        (g) => `${g.selected ? '▶' : ''}${g.name} ×${g.count}`,
                      )
                      .join('  ')}
              </Text>
              {loadout.equipment && (
                <Text lineClamp={1} flexShrink={0}>
                  {loadout.equipment}
                </Text>
              )}
            </Flex>
          </Box>
        )}
        {!alive && (
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
            direction="column"
            bg="blackAlpha.800"
          >
            {status?.respawnInMs !== undefined && (
              <>
                <Text
                  fontSize="xs"
                  fontWeight="bold"
                  letterSpacing="wider"
                  color="red.300"
                >
                  RESPAWNING IN
                </Text>
                <Text fontSize="sm" fontVariantNumeric="tabular-nums">
                  {(status.respawnInMs / 1000).toFixed(0)}
                </Text>
              </>
            )}
          </Flex>
        )}
      </Box>
    );
  },
  (previous, next) => {
    const previousStatus = previous.status;
    const nextStatus = next.status;
    const previousLoadout = previous.loadout;
    const nextLoadout = next.loadout;
    return (
      previous.player === next.player &&
      previous.color === next.color &&
      previous.side === next.side &&
      previous.point?.shield === next.point?.shield &&
      previous.point?.health === next.point?.health &&
      previousStatus?.alive === nextStatus?.alive &&
      previousStatus?.stats?.score === nextStatus?.stats?.score &&
      previousStatus?.stats?.kills === nextStatus?.stats?.kills &&
      previousStatus?.stats?.deaths === nextStatus?.stats?.deaths &&
      previousStatus?.stats?.assists === nextStatus?.stats?.assists &&
      (previousStatus?.respawnInMs === undefined
        ? undefined
        : (previousStatus.respawnInMs / 1000).toFixed(0)) ===
        (nextStatus?.respawnInMs === undefined
          ? undefined
          : (nextStatus.respawnInMs / 1000).toFixed(0)) &&
      !!previousLoadout === !!nextLoadout &&
      previousLoadout?.weapon === nextLoadout?.weapon &&
      previousLoadout?.ammoKnown === nextLoadout?.ammoKnown &&
      previousLoadout?.mag === nextLoadout?.mag &&
      previousLoadout?.reserve === nextLoadout?.reserve &&
      previousLoadout?.chargeLeft === nextLoadout?.chargeLeft &&
      previousLoadout?.holstered?.weapon === nextLoadout?.holstered?.weapon &&
      previousLoadout?.holstered?.mag === nextLoadout?.holstered?.mag &&
      previousLoadout?.holstered?.reserve === nextLoadout?.holstered?.reserve &&
      previousLoadout?.equipment === nextLoadout?.equipment &&
      previousLoadout?.grenades.length === nextLoadout?.grenades.length &&
      (previousLoadout?.grenades.every((grenade, index) => {
        const other = nextLoadout?.grenades[index];
        return (
          grenade.name === other?.name &&
          grenade.count === other.count &&
          grenade.selected === other.selected
        );
      }) ??
        true)
    );
  },
);

import { Box, Flex, Text } from '@chakra-ui/react';
import type { KillFeedEntry, KillFeedPlayer } from '../../lib/film';
import { memo, useEffect, useRef, useState } from 'react';

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function damagePercent(percent: number | undefined) {
  return percent === undefined ? null : (
    <Text
      as="span"
      title="Raw killer and named-assister percentages from the film's PlayerKilledEvent. Other recorded damage contributors have no reported share here."
      opacity={0.8}
      whiteSpace="nowrap"
    >
      {' '}
      {percent}%
    </Text>
  );
}

const KillFeedRow = memo(
  function KillFeedRow({
    entry,
    index,
    active,
    occurred,
    teamColors,
    onSeek,
  }: {
    entry: KillFeedEntry;
    index: number;
    active: boolean;
    occurred: boolean;
    teamColors: string[];
    onSeek: (timeMs: number) => void;
  }) {
    const name = (player: KillFeedPlayer | undefined, fallback: string) => (
      <Text
        as="span"
        color={
          player?.team !== undefined && player.team >= 0
            ? teamColors[player.team % teamColors.length]
            : undefined
        }
      >
        {player?.gamertag || (player ? player.xuid : fallback)}
      </Text>
    );
    return (
      <Box
        as="button"
        data-feed-index={index}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSeek(entry.timeMs)}
        display="block"
        w="100%"
        textAlign="left"
        cursor="pointer"
        _hover={{ bg: 'whiteAlpha.300' }}
        _focusVisible={{
          outline: '2px solid',
          outlineColor: 'yellow.300',
          outlineOffset: '-2px',
        }}
        py={2}
        px={1}
        bg={active ? 'whiteAlpha.200' : undefined}
        borderLeftWidth="3px"
        borderLeftColor={active ? 'yellow.300' : 'transparent'}
        borderBottomWidth="1px"
        borderBottomColor="whiteAlpha.200"
        opacity={occurred ? 1 : 0.6}
        fontSize="xs"
        overflowWrap="anywhere"
      >
        <Flex gap={2} align="baseline">
          <Text flexShrink={0} fontVariantNumeric="tabular-nums" opacity={0.75}>
            {formatTime(entry.timeMs)}
          </Text>
          <Box>
            {name(entry.killer, 'Unknown killer')}
            {damagePercent(entry.killerDamagePercent)}{' '}
            <Text as="span" opacity={0.7}>
              →
            </Text>{' '}
            {name(entry.victim, 'Unknown victim')}
          </Box>
        </Flex>
        {entry.damageAssists.length > 0 && (
          <Box pl="42px" opacity={0.8}>
            {entry.damageAssists.map((assist) => (
              <Box key={assist.xuid} whiteSpace="nowrap">
                {name(assist, 'Unknown')}
                {damagePercent(assist.damagePercent)}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  },
  (previous, next) =>
    previous.entry === next.entry &&
    previous.index === next.index &&
    previous.active === next.active &&
    previous.occurred === next.occurred &&
    previous.onSeek === next.onSeek &&
    previous.teamColors.length === next.teamColors.length &&
    previous.teamColors.every(
      (color, index) => color === next.teamColors[index],
    ),
);

export function EventFeed({
  entries,
  timeMs,
  teamColors,
  visible,
  onSeek,
}: {
  entries: KillFeedEntry[];
  timeMs: number;
  teamColors: string[];
  visible: boolean;
  onSeek: (timeMs: number) => void;
}) {
  let activeIndex = -1;
  for (
    let index = 0;
    index < entries.length && entries[index].timeMs <= timeMs;
    index++
  ) {
    activeIndex = index;
  }
  return (
    <EventFeedContent
      entries={entries}
      activeIndex={activeIndex}
      teamColors={teamColors}
      visible={visible}
      onSeek={onSeek}
    />
  );
}

const EventFeedContent = memo(
  function EventFeedContent({
    entries,
    activeIndex,
    teamColors,
    visible,
    onSeek,
  }: {
    entries: KillFeedEntry[];
    activeIndex: number;
    teamColors: string[];
    visible: boolean;
    onSeek: (timeMs: number) => void;
  }) {
    const [autoScroll, setAutoScroll] = useState(true);
    const listRef = useRef<HTMLDivElement>(null);
    const automaticScrollTop = useRef(0);
    useEffect(() => {
      const list = listRef.current;
      if (!visible || !autoScroll || !list) return;
      const row = list.querySelector<HTMLElement>(
        `[data-feed-index="${activeIndex}"]`,
      );
      list.scrollTop = row
        ? list.scrollTop +
          row.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - row.offsetHeight) / 2
        : 0;
      automaticScrollTop.current = list.scrollTop;
    }, [activeIndex, autoScroll, entries, visible]);

    return (
      <Flex direction="column" h={0} minH="100%" minW={0} color="white">
        <Flex align="center" justify="space-between" gap={2} pb={2}>
          <Text fontWeight="bold" fontSize="sm">
            Event feed
          </Text>
          <Flex
            as="label"
            align="center"
            gap={1}
            fontSize="xs"
            whiteSpace="nowrap"
          >
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
            />
            Autoscroll
          </Flex>
        </Flex>
        <Box
          ref={listRef}
          position="relative"
          flex={1}
          minH={0}
          overflowY="auto"
          aria-label="Kill feed"
          onScroll={(event) => {
            if (
              visible &&
              Math.abs(
                event.currentTarget.scrollTop - automaticScrollTop.current,
              ) > 1
            ) {
              setAutoScroll(false);
            }
          }}
        >
          {entries.length === 0 ? (
            <Text fontSize="xs" opacity={0.7}>
              No kill events available.
            </Text>
          ) : (
            entries.map((entry: KillFeedEntry, index) => (
              <KillFeedRow
                key={index}
                entry={entry}
                index={index}
                active={index === activeIndex}
                occurred={index <= activeIndex}
                teamColors={teamColors}
                onSeek={onSeek}
              />
            ))
          )}
        </Box>
      </Flex>
    );
  },
  (previous, next) =>
    previous.entries === next.entries &&
    previous.activeIndex === next.activeIndex &&
    previous.visible === next.visible &&
    previous.onSeek === next.onSeek &&
    previous.teamColors.length === next.teamColors.length &&
    previous.teamColors.every(
      (color, index) => color === next.teamColors[index],
    ),
);

import { Flex, IconButton, Slider, Text } from '@chakra-ui/react';
import { Pause, Play } from 'lucide-react';

function formatClock(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Native-looking scrubber overlaid on embeds whose own controls are hidden. */
export function EmbedAlignControls({
  positionSec,
  durationSec,
  paused,
  onSeek,
  onTogglePlay,
}: {
  positionSec: number;
  durationSec: number;
  paused: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
}) {
  const max = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  return (
    <Flex
      position="absolute"
      insetX={0}
      bottom={0}
      align="center"
      gap={2}
      px={2}
      pt={6}
      pb={1.5}
      color="white"
      bgGradient="to-t"
      gradientFrom="blackAlpha.800"
      gradientTo="transparent"
    >
      <IconButton
        size="xs"
        color="white"
        _hover={{ bg: 'whiteAlpha.200' }}
        aria-label={paused ? 'Play video' : 'Pause video'}
        onClick={onTogglePlay}
      >
        {paused ? (
          <Play size={16} fill="currentColor" />
        ) : (
          <Pause size={16} fill="currentColor" />
        )}
      </IconButton>
      <Text fontSize="xs" fontVariantNumeric="tabular-nums" whiteSpace="nowrap">
        {formatClock(positionSec)} / {formatClock(durationSec)}
      </Text>
      <Slider.Root
        flex={1}
        size="sm"
        aria-label={['Video position']}
        min={0}
        max={max}
        step={0.1}
        value={[Math.min(Math.max(positionSec, 0), max)]}
        onValueChange={({ value: [next] }) => onSeek(next)}
      >
        <Slider.Control>
          <Slider.Track h="4px" bg="whiteAlpha.400" borderRadius="full">
            <Slider.Range bg="white" />
          </Slider.Track>
          <Slider.Thumb
            index={0}
            boxSize="12px"
            bg="white"
            borderWidth={0}
            boxShadow="sm"
          >
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
    </Flex>
  );
}

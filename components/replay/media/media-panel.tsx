import {
  Button,
  createListCollection,
  Field,
  Fieldset,
  Flex,
  HoverCard,
  HStack,
  IconButton,
  Portal,
  Select,
  Slider,
} from '@chakra-ui/react';
import { ProgressiveMatch } from '@gravllift/halo-helpers';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import type { ITimingObject } from 'timing-object';
import { MediaItem } from './media-item';
import { MediaSourceDialog } from './media-source-dialog';
import { type MediaSource, mediaSourceLabel } from './media-source-picker';

const MAX_ITEMS = 4;

interface Item {
  id: number;
  source: MediaSource;
}

export interface MediaPanelProps {
  clock: MutableRefObject<number>;
  timeMs: number;
  playing: boolean;
  speed: number;
  waiting: boolean;
  aligning: boolean;
  onAligningChange: (aligning: boolean) => void;
  match: ProgressiveMatch;
  matchDurationMs: number;
}

export function MediaPanel({
  aligning,
  onAligningChange,
  match,
  ...itemProps
}: MediaPanelProps) {
  const [timingObject, setTimingObject] = useState<ITimingObject>();
  const nextId = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [audibleIds, setAudibleIds] = useState<number[]>([]);
  const previousItemCount = useRef(0);
  const [volume, setVolume] = useState(1);
  const unmutedVolume = useRef(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import('timing-object').then(({ TimingObject }) => {
      if (!cancelled) setTimingObject(new TimingObject());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!timingObject) return;
    const position = itemProps.clock.current / 1000;
    const velocity =
      itemProps.playing && !itemProps.waiting && !aligning
        ? itemProps.speed
        : 0;
    const current = timingObject.query();
    if (
      current.velocity !== velocity ||
      Math.abs(current.position - position) > (velocity === 0 ? 0.001 : 0.25)
    )
      void timingObject.update({ position, velocity });
  }, [
    timingObject,
    itemProps.clock,
    itemProps.timeMs,
    itemProps.playing,
    itemProps.waiting,
    itemProps.speed,
    aligning,
  ]);

  useEffect(() => {
    const wasEmpty = previousItemCount.current === 0;
    previousItemCount.current = items.length;
    setAudibleIds((current) => {
      if (wasEmpty && items.length > 0) return [items[0].id];
      const remaining = current.filter((id) =>
        items.some((item) => item.id === id),
      );
      return remaining.length === current.length ? current : remaining;
    });
  }, [items]);

  useEffect(() => {
    if (aligning && items.length === 0) onAligningChange(false);
  }, [aligning, items.length, onAligningChange]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const audioSources = createListCollection({
    items: items.map((item) => ({
      label: mediaSourceLabel(item.source),
      value: String(item.id),
    })),
  });

  return (
    <Flex direction="column" gap={2} h="100%" minH={0} pl={2}>
      <HStack gap={2} flexShrink={0} className="group">
        {items.length > 0 && (
          <Button
            variant={aligning ? 'solid' : undefined}
            colorPalette={aligning ? 'teal' : undefined}
            aria-pressed={aligning}
            disabled={items.length === 0}
            title="Pause the replay and scrub media directly to adjust offsets"
            onClick={() => onAligningChange(!aligning)}
          >
            {aligning ? 'Done aligning' : 'Manual Alignment'}
          </Button>
        )}
        <Flex flex={1} />
        {items.length > 0 && (
          <HoverCard.Root
            size="lg"
            openDelay={0}
            closeDelay={700}
            positioning={{ placement: 'bottom-end', gutter: 0 }}
          >
            <HoverCard.Trigger asChild>
              <IconButton
                aria-label={volume === 0 ? 'Unmute media' : 'Mute media'}
                onClick={() => {
                  if (volume === 0) setVolume(unmutedVolume.current || 1);
                  else {
                    unmutedVolume.current = volume;
                    setVolume(0);
                  }
                }}
              >
                <VolumeIcon size={16} />
              </IconButton>
            </HoverCard.Trigger>
            <Portal>
              <HoverCard.Positioner>
                <HoverCard.Content>
                  <Fieldset.Root size="lg">
                    <Field.Root>
                      <Slider.Root
                        aria-label={['Media volume']}
                        w="full"
                        min={0}
                        max={1}
                        step={0.05}
                        value={[volume]}
                        onValueChange={({ value: [next] }) => setVolume(next)}
                      >
                        <Slider.Control>
                          <Slider.Track>
                            <Slider.Range bg="gray.400" />
                          </Slider.Track>
                          <Slider.Thumbs />
                        </Slider.Control>
                      </Slider.Root>
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>Sources</Field.Label>
                      <Select.Root
                        multiple
                        closeOnSelect={false}
                        collection={audioSources}
                        value={audibleIds.map(String)}
                        onValueChange={({ value }) =>
                          setAudibleIds(value.map(Number))
                        }
                        positioning={{ strategy: 'fixed' }}
                      >
                        <Select.HiddenSelect />
                        <Select.Control>
                          <Select.Trigger aria-label="Audio source">
                            <Select.ValueText placeholder="No sources" />
                          </Select.Trigger>
                          <Select.IndicatorGroup>
                            <Select.Indicator />
                          </Select.IndicatorGroup>
                        </Select.Control>
                        <Select.Positioner>
                          <Select.Content>
                            {audioSources.items.map((item) => (
                              <Select.Item key={item.value} item={item}>
                                {item.label}
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Select.Root>
                    </Field.Root>
                  </Fieldset.Root>
                </HoverCard.Content>
              </HoverCard.Positioner>
            </Portal>
          </HoverCard.Root>
        )}
      </HStack>
      <MediaSourceDialog
        open={adding}
        onOpenChange={setAdding}
        onSelect={(source) =>
          setItems((current) => [...current, { id: nextId.current++, source }])
        }
      />
      <Flex direction="column" gap={2} flex={1} minH={0} overflowY="auto">
        {items.map((item) => (
          <MediaItem
            key={item.id}
            {...itemProps}
            timingObject={timingObject}
            source={item.source}
            matchId={match.MatchId}
            matchStartMs={Date.parse(match.MatchInfo.StartTime)}
            aligning={aligning}
            volume={audibleIds.includes(item.id) ? volume : 0}
            onRemove={() =>
              setItems((current) =>
                current.filter((existing) => existing.id !== item.id),
              )
            }
          />
        ))}
        <Button
          aria-label="Add media"
          title={
            items.length >= MAX_ITEMS
              ? `Up to ${MAX_ITEMS} media items`
              : 'Add a video, audio file, or Twitch VOD'
          }
          disabled={items.length >= MAX_ITEMS}
          onClick={() => setAdding(true)}
        >
          Add Media
        </Button>
      </Flex>
    </Flex>
  );
}

import {
  Box,
  Button,
  Flex,
  Grid,
  Slider,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { ProgressiveMatch } from '@gravllift/halo-helpers';
import { List, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiClients } from '../../lib/contexts/api-client-contexts';
import { useTeamPresets } from '../match/team-presets';
import MiniMap from './mini-map';
import { KillFeed } from './kill-feed';
import { TeamPanel } from './team-panel';
import { Bounds, LoadState, LoadedBackground } from './types';
import { createReplayDecoder } from './replay-decoder';

const CONTENT_ALPHA = 16;
const CONTENT_PADDING = 0.03;
/** Approximate width of the native slider thumb, which the track travel excludes. */
const THUMB_PX = 16;

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Bounding box of the image's painted pixels, padded, in normalized film space. */
function paintedBounds(
  image: HTMLImageElement,
  extent: Bounds,
): Bounds | undefined {
  const { naturalWidth: w, naturalHeight: h } = image;
  const scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  let left = w;
  let right = -1;
  let top = h;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < CONTENT_ALPHA) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return undefined;
  const spanX = extent.maxX - extent.minX;
  const spanY = extent.maxY - extent.minY;
  const pad = CONTENT_PADDING * Math.max(right - left, bottom - top);
  return {
    minX: extent.minX + ((left - pad) / w) * spanX,
    maxX: extent.minX + ((right + 1 + pad) / w) * spanX,
    maxY: extent.maxY - ((top - pad) / h) * spanY,
    minY: extent.maxY - ((bottom + 1 + pad) / h) * spanY,
  };
}

const SPEEDS = [1, 2, 4, 8, 16];

export default function Replay({
  match,
  navigationSignal,
}: {
  match: ProgressiveMatch;
  navigationSignal?: AbortSignal;
}) {
  const { haloInfiniteClient } = useApiClients();
  const teamColors = useTeamPresets().map((t) => t.color);
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [timeMs, setTimeMs] = useState(0);
  const timeRef = useRef(timeMs);
  timeRef.current = timeMs;
  const [filmEndMs, setFilmEndMs] = useState(0);
  const [pendingSeek, setPendingSeek] = useState<number>();
  const priorityRef = useRef<number>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState<{ px: number; timeMs: number }>();
  const [feedVisible, setFeedVisible] = useState(true);
  const [feedOverlay, setFeedOverlay] = useState<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController>();
  const [background, setBackground] = useState<LoadedBackground>();
  const backgroundSpec =
    state.status === 'ready' ? state.replay.map.background : undefined;
  const imageName = backgroundSpec?.image;
  const minX = backgroundSpec?.minX;
  const maxX = backgroundSpec?.maxX;
  const minY = backgroundSpec?.minY;
  const maxY = backgroundSpec?.maxY;
  const points = useMemo(
    () => (state.status === 'ready' ? state.replay.at(timeMs) : []),
    [state, timeMs],
  );
  useEffect(() => {
    setBackground(undefined);
    if (
      imageName === undefined ||
      minX === undefined ||
      maxX === undefined ||
      minY === undefined ||
      maxY === undefined
    )
      return;
    const spec = { image: imageName, minX, maxX, minY, maxY };
    const image = new Image();
    image.onload = () =>
      setBackground({
        element: image,
        ...spec,
        content: paintedBounds(image, spec) ?? spec,
      });
    image.src = `/map-backgrounds/${imageName}`;
    return () => {
      image.onload = null;
    };
  }, [imageName, minX, maxX, minY, maxY]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!navigationSignal) return;
    const cleanup = () => {
      abortRef.current?.abort();
      priorityRef.current = undefined;
      setPendingSeek(undefined);
      setPlaying(false);
      setState({ status: 'idle' });
    };
    if (navigationSignal.aborted) cleanup();
    else navigationSignal.addEventListener('abort', cleanup, { once: true });
    return () => navigationSignal.removeEventListener('abort', cleanup);
  }, [navigationSignal]);

  const load = useCallback(async () => {
    if (navigationSignal?.aborted) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    let decoder: ReturnType<typeof createReplayDecoder> | undefined;
    const terminateDecoder = () => decoder?.terminate();
    abort.signal.addEventListener('abort', terminateDecoder, { once: true });
    try {
      setPlaying(false);
      priorityRef.current = undefined;
      setPendingSeek(undefined);
      setState({ status: 'loading', progress: 'Fetching film manifest...' });
      const film = await haloInfiniteClient.spectateMatch(match.MatchId, {
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      const { BlobStoragePathPrefix } = film;
      setFilmEndMs(
        film.CustomData.Chunks.filter((chunk) => chunk.ChunkType === 2).reduce(
          (end, chunk) =>
            Math.max(
              end,
              chunk.ChunkStartTimeOffsetMilliseconds +
                chunk.DurationMilliseconds,
            ),
          0,
        ),
      );
      // Loaded on demand so the parser stays out of the main bundle.
      const { loadFilm } = await import('../../lib/film');
      if (abort.signal.aborted) return;
      decoder = createReplayDecoder();
      let receivedReplay = false;
      const updateProgress = (progress: string) => {
        if (abort.signal.aborted) return;
        setState((current) =>
          current.status === 'ready'
            ? { ...current, progress }
            : { status: 'loading', progress },
        );
      };
      await loadFilm({
        film,
        match,
        signal: abort.signal,
        decode: decoder.decode,
        getPriorityTime: () => priorityRef.current,
        fetchChunk: (_index, fileRelativePath) =>
          haloInfiniteClient.getFilmChunk(
            BlobStoragePathPrefix,
            fileRelativePath,
            {
              signal: abort.signal,
            },
          ),
        onProgress: (downloaded, total) =>
          updateProgress(`Downloaded chunk ${downloaded}/${total}...`),
        onStage: updateProgress,
        onReplay: (replay, complete) => {
          if (abort.signal.aborted) return;
          if (!receivedReplay) {
            timeRef.current = replay.firstSpawnMs ?? replay.startMs;
            setTimeMs(timeRef.current);
          }
          const target = priorityRef.current;
          if (target !== undefined && (target <= replay.endMs || complete)) {
            timeRef.current = Math.min(target, replay.endMs);
            setTimeMs(timeRef.current);
            priorityRef.current = undefined;
            setPendingSeek(undefined);
          }
          receivedReplay = true;
          setState({ status: 'ready', replay, complete });
        },
      });
    } catch (e) {
      if (abort.signal.aborted) return;
      setPlaying(false);
      priorityRef.current = undefined;
      setPendingSeek(undefined);
      const message = e instanceof Error ? e.message : String(e);
      setState((current) =>
        current.status === 'ready'
          ? { ...current, progress: undefined, error: message }
          : { status: 'error', message },
      );
    } finally {
      abort.signal.removeEventListener('abort', terminateDecoder);
      terminateDecoder();
    }
  }, [haloInfiniteClient, match, navigationSignal]);

  useEffect(() => {
    load();
  }, [load]);

  // Playback clock.
  useEffect(() => {
    if (state.status !== 'ready' || !playing || pendingSeek !== undefined)
      return;
    const { replay } = state;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      const next = Math.min(timeRef.current + delta * speed, replay.endMs);
      const ended = state.complete && next >= replay.endMs;
      timeRef.current = next;
      setTimeMs(next);
      if (ended) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, playing, speed, pendingSeek]);

  if (state.status !== 'ready') {
    return (
      <Flex direction="column" align="center" justify="center" gap={2} h="100%">
        {state.status === 'error' ? (
          <>
            <Text color="red.500">Unable to load replay: {state.message}</Text>
            <Button onClick={load}>Retry</Button>
          </>
        ) : (
          <>
            <Spinner />
            <Text>
              {state.status === 'loading'
                ? state.progress
                : 'Fetching film manifest...'}
            </Text>
          </>
        )}
      </Flex>
    );
  }

  const { replay } = state;
  const endMs = Math.max(filmEndMs, replay.endMs);
  const loadedPercent =
    endMs > replay.startMs
      ? Math.min(
          100,
          Math.max(
            0,
            ((replay.endMs - replay.startMs) / (endMs - replay.startMs)) * 100,
          ),
        )
      : 100;
  const playedPercent =
    endMs > replay.startMs
      ? Math.min(
          loadedPercent,
          Math.max(
            0,
            ((timeMs - replay.startMs) / (endMs - replay.startMs)) * 100,
          ),
        )
      : 0;
  const seek = (next: number) => {
    if (next > replay.endMs && !state.complete) {
      if (state.error) return;
      priorityRef.current = next;
      setPendingSeek(next);
      return;
    }
    priorityRef.current = undefined;
    setPendingSeek(undefined);
    timeRef.current = next;
    setTimeMs(next);
  };
  const scores = replay.scores(timeMs);
  const teamIds = [
    ...new Set(
      replay.players.flatMap((p) => (p.team !== undefined ? [p.team] : [])),
    ),
  ].sort((a, b) => a - b);
  const [leftTeam, rightTeam] = teamIds;
  const leftPlayers = replay.players.filter((p) => p.team === leftTeam);
  const rightPlayers = replay.players.filter(
    (p) => rightTeam !== undefined && p.team === rightTeam,
  );
  const teamColorOf = (team: number | undefined) =>
    team !== undefined && teamColors.length > 0
      ? teamColors[team % teamColors.length]
      : undefined;
  return (
    <Flex direction="column" align="stretch" gap={2} h="100%" minH={0}>
      <Flex
        align="center"
        justify="center"
        gap={4}
        flexShrink={0}
        fontVariantNumeric="tabular-nums"
      >
        {scores.map((s, i) => (
          <Text
            key={s.team ?? `slot${i}`}
            fontSize="2xl"
            fontWeight="bold"
            color={
              s.team !== undefined && teamColors.length > 0
                ? teamColors[s.team % teamColors.length]
                : undefined
            }
          >
            {s.roundsWon ?? s.score}
          </Text>
        ))}
      </Flex>
      <Grid
        templateColumns="minmax(0, 1fr)"
        templateRows="minmax(0, 1fr) auto"
        columnGap={3}
        rowGap={2}
        flex={1}
        minH={0}
        w="100%"
      >
        <Box position="relative" minW={0} minH={0}>
          <Grid
            templateColumns="auto minmax(0, 1fr) auto"
            gap={3}
            h="100%"
            minH={0}
          >
            <TeamPanel
              players={leftPlayers}
              replay={replay}
              points={points}
              timeMs={timeMs}
              color={teamColorOf(leftTeam)}
              side="left"
            />
            <Box position="relative" display="grid" minW={0} minH={0}>
              <MiniMap
                state={state}
                points={points}
                timeMs={timeMs}
                teamColors={teamColors}
                objectives={state.replay.map.objectives}
                background={background}
                draggable={true}
                leftOverlay={feedVisible ? feedOverlay : null}
              />
              <Box
                ref={setFeedOverlay}
                display={feedVisible ? 'block' : 'none'}
                position="absolute"
                top={2}
                bottom={2}
                left={2}
                w="min(240px, 42%)"
                p={2}
                bg="blackAlpha.800"
                borderRadius="md"
              >
                <KillFeed
                  entries={replay.killFeed}
                  timeMs={timeMs}
                  teamColors={teamColors}
                  visible={feedVisible}
                  onSeek={seek}
                />
              </Box>
            </Box>
            <TeamPanel
              players={rightPlayers}
              replay={replay}
              points={points}
              timeMs={timeMs}
              color={teamColorOf(rightTeam)}
              side="right"
            />
          </Grid>
          {pendingSeek !== undefined && (
            <Flex
              position="absolute"
              inset={0}
              align="center"
              justify="center"
              bg="blackAlpha.600"
              pointerEvents="none"
              role="status"
              aria-label="Loading requested replay position"
            >
              <Spinner size="xl" />
            </Flex>
          )}
        </Box>
        <Flex align="center" gap={3} gridColumn="1 / -1">
          <Button
            size="sm"
            aria-label={feedVisible ? 'Hide kill feed' : 'Show kill feed'}
            aria-pressed={feedVisible}
            title={feedVisible ? 'Hide kill feed' : 'Show kill feed'}
            onClick={() => setFeedVisible((visible) => !visible)}
          >
            <List size={16} />
          </Button>
          <Button
            size="sm"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => {
              if (!playing && state.complete && timeMs >= replay.endMs)
                setTimeMs(replay.startMs);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Box
            position="relative"
            flexGrow={1}
            display="flex"
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const usable = Math.max(rect.width - THUMB_PX, 1);
              const x = Math.min(
                Math.max(e.clientX - rect.left - THUMB_PX / 2, 0),
                usable,
              );
              setHover({
                px: x + THUMB_PX / 2,
                timeMs:
                  replay.startMs + (x / usable) * (endMs - replay.startMs),
              });
            }}
            onPointerLeave={() => setHover(undefined)}
          >
            <Slider.Root
              aria-label={['Replay position']}
              flexGrow={1}
              min={replay.startMs}
              max={endMs}
              step={100}
              value={[pendingSeek ?? timeMs]}
              getAriaValueText={({ value }) =>
                `${formatTime(value)} of ${formatTime(endMs)}, loaded through ${formatTime(replay.endMs)}`
              }
              onValueChange={({ value: [next] }) => seek(next)}
            >
              <Slider.Control>
                <Slider.Track bg="gray.600">
                  <Box
                    position="absolute"
                    insetY={0}
                    left={0}
                    w={`${loadedPercent}%`}
                    bg="gray.400"
                    pointerEvents="none"
                    aria-hidden="true"
                    data-testid="replay-loaded-range"
                  />
                  <Box
                    position="absolute"
                    insetY={0}
                    left={0}
                    w={`${playedPercent}%`}
                    bg="teal.500"
                    pointerEvents="none"
                    aria-hidden="true"
                    data-testid="replay-played-range"
                  />
                </Slider.Track>
                <Slider.Thumbs />
              </Slider.Control>
            </Slider.Root>
            {hover && (
              <Text
                position="absolute"
                bottom="100%"
                left={`${hover.px}px`}
                transform="translateX(-50%)"
                mb={1}
                px={2}
                py={0.5}
                rounded="md"
                bg="blackAlpha.800"
                color="white"
                fontSize="xs"
                fontVariantNumeric="tabular-nums"
                pointerEvents="none"
                whiteSpace="nowrap"
              >
                {formatTime(hover.timeMs)}
              </Text>
            )}
          </Box>
          <Text fontVariantNumeric="tabular-nums" minW="90px" textAlign="right">
            {formatTime(pendingSeek ?? timeMs)} / {formatTime(endMs)}
          </Text>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </Flex>
      </Grid>
      {!state.complete && (
        <Flex align="center" gap={2} flexShrink={0}>
          {!state.error && <Spinner size="xs" />}
          <Text fontSize="sm" color={state.error ? 'red.500' : undefined}>
            {state.error
              ? `Loading stopped: ${state.error}`
              : (state.progress ?? 'Loading more of the replay...')}
          </Text>
          {state.error && (
            <Button size="xs" onClick={load}>
              Retry
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
}

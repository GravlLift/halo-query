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
import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClients } from '../../lib/contexts/api-client-contexts';
import { useTeamPresets } from '../match/team-presets';
import MiniMap from './mini-map';
import { TeamPanel } from './team-panel';
import { Bounds, LoadState, LoadedBackground } from './types';

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

export default function Replay({ match }: { match: ProgressiveMatch }) {
  const { haloInfiniteClient } = useApiClients();
  const teamColors = useTeamPresets().map((t) => t.color);
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState<{ px: number; timeMs: number }>();
  const abortRef = useRef<AbortController>();
  const [background, setBackground] = useState<LoadedBackground>();
  const backgroundSpec =
    state.status === 'ready' ? state.replay.map.background : undefined;
  useEffect(() => {
    setBackground(undefined);
    if (!backgroundSpec) return;
    const image = new Image();
    image.onload = () =>
      setBackground({
        element: image,
        ...backgroundSpec,
        content: paintedBounds(image, backgroundSpec) ?? backgroundSpec,
      });
    image.src = `/map-backgrounds/${backgroundSpec.image}`;
  }, [backgroundSpec]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      setState({ status: 'loading', progress: 'Fetching film manifest…' });
      const film = await haloInfiniteClient.spectateMatch(match.MatchId, {
        signal: abort.signal,
      });
      const { BlobStoragePathPrefix } = film;
      // Loaded on demand so the parser stays out of the main bundle.
      const { loadFilm } = await import('@gravllift/halo-film');
      const replay = await loadFilm({
        film,
        match,
        fetchChunk: (index) =>
          haloInfiniteClient.getFilmChunk(BlobStoragePathPrefix, index, {
            signal: abort.signal,
          }),
        onProgress: (downloaded, total) =>
          setState({
            status: 'loading',
            progress: `Downloaded chunk ${downloaded}/${total}…`,
          }),
      });
      setTimeMs(replay.startMs);
      setState({ status: 'ready', replay });
    } catch (e) {
      if (abort.signal.aborted) return;
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [haloInfiniteClient, match]);

  useEffect(() => {
    load();
  }, [load]);

  // Playback clock.
  useEffect(() => {
    if (state.status !== 'ready' || !playing) return;
    const { replay } = state;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      let ended = false;
      setTimeMs((t) => {
        const next = t + delta * speed;
        if (next >= replay.endMs) {
          ended = true;
          return replay.endMs;
        }
        return next;
      });
      if (ended) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, playing, speed]);

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
                : 'Fetching film manifest…'}
            </Text>
          </>
        )}
      </Flex>
    );
  }

  const { replay } = state;
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
        templateColumns="auto minmax(0, 1fr) auto"
        templateRows="minmax(0, 1fr) auto"
        columnGap={3}
        rowGap={2}
        flex={1}
        minH={0}
        w="100%"
      >
        <TeamPanel
          players={leftPlayers}
          replay={replay}
          timeMs={timeMs}
          color={teamColorOf(leftTeam)}
          side="left"
        />
        <MiniMap
          state={state}
          timeMs={timeMs}
          teamColors={teamColors}
          objectives={state.replay.map.objectives}
          background={background}
        />
        <TeamPanel
          players={rightPlayers}
          replay={replay}
          timeMs={timeMs}
          color={teamColorOf(rightTeam)}
          side="right"
        />
        <Flex align="center" gap={3} gridColumn="1 / -1">
          <Button
            size="sm"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => {
              if (!playing && timeMs >= replay.endMs) setTimeMs(replay.startMs);
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
                  replay.startMs +
                  (x / usable) * (replay.endMs - replay.startMs),
              });
            }}
            onPointerLeave={() => setHover(undefined)}
          >
            <Slider.Root
              aria-label={['Replay position']}
              flexGrow={1}
              min={replay.startMs}
              max={replay.endMs}
              step={100}
              value={[timeMs]}
              onValueChange={({ value: [next] }) => setTimeMs(next)}
            >
              <Slider.Control>
                <Slider.Track>
                  <Slider.Range />
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
            {formatTime(timeMs)} / {formatTime(replay.endMs)}
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
    </Flex>
  );
}

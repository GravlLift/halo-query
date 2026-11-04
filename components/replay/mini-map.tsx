import { Box, Button, Flex, Slider, Text } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import type {
  MapObjective,
  HillState,
  ReplayProjectile,
  ZoneState,
} from '@gravllift/halo-film';
import type { Replay as FilmReplay } from '@gravllift/halo-film';
import { LoadedBackground, LoadState } from './types';

const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 };
const CANVAS_SIZE = 600;
const PADDING = 24;
const PLAYER_TRAIL_MS = 500;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 16;
const FIRE_FLASH_MS = 250;
const BLAST_MS = 600;
const FIRE_LINE_LENGTH = 28;

/** Screen position = base position * zoom + pan (canvas pixels). */
interface View {
  zoom: number;
  panX: number;
  panY: number;
}

function colorFor(replay: FilmReplay, actor: number, teamColors: string[]) {
  const team = replay.players[actor]?.team;
  return team !== undefined && team >= 0 && teamColors.length > 0
    ? teamColors[team % teamColors.length]
    : '#000000';
}

function zoomAbout(v: View, factor: number, px: number, py: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const ratio = zoom / v.zoom;
  return {
    zoom,
    panX: px - (px - v.panX) * ratio,
    panY: py - (py - v.panY) * ratio,
  };
}

function drawObjectives(
  ctx: CanvasRenderingContext2D,
  objectives: MapObjective[],
  teamColors: string[],
  toCanvas: (x: number, y: number) => [number, number],
  pxPerUnit: number,
  zoneStates: ZoneState[],
  hill?: HillState,
) {
  const teamColor = (team: number) =>
    team >= 0 && teamColors.length > 0
      ? teamColors[team % teamColors.length]
      : '#d4d4d8';
  let zoneIndex = 0;
  let hillIndex = 0;
  for (const o of objectives) {
    // Flag spawns are drawn as live flags, which also know which ones are in use.
    if (o.role === 'flag_spawn') continue;
    // Likewise the skull: its live home comes from the film's creation records, and the
    // catalog spawn can sit elsewhere (Live Fire is ~20 m off the real one).
    if (o.role === 'oddball_spawn') continue;
    const zone =
      o.role === 'strongholds_zone' ? zoneStates[zoneIndex++] : undefined;
    const hillNumber = o.role === 'hill' ? hillIndex++ : -1;
    const isActiveHill = hill !== undefined && hill.activeHill === hillNumber;
    const dimmed = hill !== undefined && hillNumber >= 0 && !isActiveHill;
    const color = teamColor(zone ? zone.owner : o.team);
    const [cx, cy] = toCanvas(o.x, o.y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (o.point) {
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      if (o.role === 'flag_delivery' || o.role === 'stockpile_socket') {
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const r = o.role === 'oddball_spawn' ? 7 : 6;
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (o.polygon) {
      o.polygon.forEach(([px, py], i) => {
        const [sx, sy] = toCanvas(px, py);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, Math.max((o.radius ?? 0.005) * pxPerUnit, 4), 0, 7);
    }
    ctx.globalAlpha = dimmed ? 0.04 : 0.12;
    ctx.fill();
    ctx.globalAlpha = dimmed ? 0.25 : 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (zone?.capturingTeam !== undefined && zone.progress > 0) {
      strokeProgress(
        ctx,
        o,
        zone.progress,
        teamColor(zone.capturingTeam),
        toCanvas,
        pxPerUnit,
      );
    }
    if (isActiveHill && hill.controllingTeam !== undefined) {
      // The hill starts scoring at once in this mode, so the outline fills fully.
      strokeProgress(
        ctx,
        o,
        1,
        teamColor(hill.controllingTeam),
        toCanvas,
        pxPerUnit,
      );
    }
  }
}

/** Strokes `progress` of an area objective's outline, starting at its first corner (or top for circles). */
function strokeProgress(
  ctx: CanvasRenderingContext2D,
  o: MapObjective,
  progress: number,
  color: string,
  toCanvas: (x: number, y: number) => [number, number],
  pxPerUnit: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (o.polygon) {
    const corners = o.polygon.map(([px, py]) => toCanvas(px, py));
    const edges = corners.map((from, i) => {
      const to = corners[(i + 1) % corners.length];
      return {
        from,
        to,
        length: Math.hypot(to[0] - from[0], to[1] - from[1]),
      };
    });
    let remaining = progress * edges.reduce((sum, e) => sum + e.length, 0);
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (const e of edges) {
      const part = e.length > 0 ? Math.min(1, remaining / e.length) : 1;
      ctx.lineTo(
        e.from[0] + (e.to[0] - e.from[0]) * part,
        e.from[1] + (e.to[1] - e.from[1]) * part,
      );
      remaining -= e.length;
      if (remaining <= 0) break;
    }
  } else {
    const [cx, cy] = toCanvas(o.x, o.y);
    ctx.arc(
      cx,
      cy,
      Math.max((o.radius ?? 0.005) * pxPerUnit, 4),
      -Math.PI / 2,
      -Math.PI / 2 + progress * Math.PI * 2,
    );
  }
  ctx.stroke();
}

/** Point progress of each team as a bar along the top centre of the canvas. */
function drawHillProgress(
  ctx: CanvasRenderingContext2D,
  hill: HillState,
  teamColors: string[],
  canvasWidth: number,
) {
  const barWidth = 120;
  const barHeight = 8;
  const gap = 12;
  const y = 10;
  const bars = [...hill.progress].sort((a, b) => a.team - b.team);
  const total = bars.length * barWidth + (bars.length - 1) * gap;
  bars.forEach(({ team, progress }, i) => {
    const x = (canvasWidth - total) / 2 + i * (barWidth + gap);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);
    ctx.fillStyle =
      teamColors.length > 0 ? teamColors[team % teamColors.length] : '#d4d4d8';
    ctx.fillRect(x, y, barWidth * progress, barHeight);
  });
}

/** Current round's points of each team as numbers along the top centre of the canvas. */
function drawRoundScores(
  ctx: CanvasRenderingContext2D,
  scores: { team: number; roundScore: number }[],
  teamColors: string[],
  canvasWidth: number,
) {
  const width = 60;
  const gap = 12;
  const y = 10;
  const sorted = [...scores].sort((a, b) => a.team - b.team);
  const total = sorted.length * width + (sorted.length - 1) * gap;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  sorted.forEach(({ team, roundScore }, i) => {
    const x = (canvasWidth - total) / 2 + i * (width + gap) + width / 2;
    ctx.fillStyle =
      teamColors.length > 0 ? teamColors[team % teamColors.length] : '#d4d4d8';
    ctx.strokeText(String(roundScore), x, y);
    ctx.fillText(String(roundScore), x, y);
  });
}

function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  flights: ReplayProjectile[],
  timeMs: number,
  toCanvas: (x: number, y: number) => [number, number],
  colorOf: (actor: number | undefined) => string,
) {
  for (const { flight, actor, lingering } of flights) {
    const start = flight.points[0].timeMs;
    const { detonation } = flight;
    const sinceBlast = timeMs - detonation.timeMs;
    if (
      lingering &&
      timeMs >= detonation.timeMs &&
      timeMs < lingering.untilMs
    ) {
      const [bx, by] = toCanvas(detonation.x, detonation.y);
      const [ex] = toCanvas(detonation.x + lingering.radius, detonation.y);
      const radius = Math.abs(ex - bx);
      const fade = Math.min((lingering.untilMs - timeMs) / 1000, 1);
      ctx.fillStyle = '#7fb8ff';
      ctx.strokeStyle = '#bfdcff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.globalAlpha = 0.3 * fade;
      ctx.fill();
      ctx.globalAlpha = 0.8 * fade;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (timeMs < start || sinceBlast > BLAST_MS) continue;
    const color = colorOf(actor);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = sinceBlast > 0 ? 0.25 : 0.7;
    ctx.beginPath();
    let moved = false;
    let head: [number, number] | undefined;
    for (const p of flight.points) {
      if (p.timeMs > timeMs) break;
      const [cx, cy] = toCanvas(p.x, p.y);
      if (moved) ctx.lineTo(cx, cy);
      else ctx.moveTo(cx, cy);
      moved = true;
      head = [cx, cy];
    }
    ctx.stroke();
    if (head && sinceBlast < 0) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(head[0], head[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (flight.explodes && sinceBlast >= 0) {
      const progress = sinceBlast / BLAST_MS;
      const [bx, by] = toCanvas(detonation.x, detonation.y);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 4 + progress * 10, 0, Math.PI * 2);
      ctx.globalAlpha = 0.35 * (1 - progress);
      ctx.fill();
      ctx.globalAlpha = 0.9 * (1 - progress);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function draw(
  canvas: HTMLCanvasElement,
  replay: FilmReplay,
  projectiles: ReplayProjectile[],
  timeMs: number,
  teamColors: string[],
  view: View,
  objectives: MapObjective[],
  size: { width: number; height: number },
  pixelRatio: number,
  background?: LoadedBackground,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = size;
  // Everything below is drawn in CSS pixels, scaled to the backing store.
  const backingWidth = Math.ceil(width * pixelRatio);
  const backingHeight = Math.ceil(height * pixelRatio);
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  ctx.setTransform(backingWidth / width, 0, 0, backingHeight / height, 0, 0);
  // Frame the painted part of the map image: its margins are empty.
  const bounds = background ? background.content : replay.bounds;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const scale = Math.min(
    (width - PADDING * 2) / spanX,
    (height - PADDING * 2) / spanY,
  );
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  // Film y grows toward the top of the map; canvas y grows downward.
  const toCanvas = (x: number, y: number): [number, number] => [
    (offsetX + (x - bounds.minX) * scale) * view.zoom + view.panX,
    (height - (offsetY + (y - bounds.minY) * scale)) * view.zoom + view.panY,
  ];

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  if (background) {
    const [left, top] = toCanvas(background.minX, background.maxY);
    const [right, bottom] = toCanvas(background.maxX, background.minY);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(background.element, left, top, right - left, bottom - top);
    ctx.globalAlpha = 1;
  }

  const hill = replay.hills(timeMs);
  drawObjectives(
    ctx,
    objectives,
    teamColors,
    toCanvas,
    scale * view.zoom,
    replay.zones(timeMs),
    hill,
  );
  drawProjectiles(ctx, projectiles, timeMs, toCanvas, (actor) =>
    actor === undefined ? '#d4d4d8' : colorFor(replay, actor, teamColors),
  );

  for (let actor = 0; actor < replay.actorCount; actor++) {
    const trail = replay.trail(actor, timeMs, PLAYER_TRAIL_MS);
    if (trail.length < 2) continue;
    ctx.strokeStyle = colorFor(replay, actor, teamColors);
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach((p, i) => {
      const [cx, cy] = toCanvas(p.x, p.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const grave of replay.graves(timeMs)) {
    const [gx, gy] = toCanvas(grave.x, grave.y);
    const arm = 6;
    // A dark underlay keeps the mark readable over any map image.
    for (const [color, width] of [
      ['#000', 5],
      [colorFor(replay, grave.actor, teamColors), 3],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - arm, gy - arm);
      ctx.lineTo(gx + arm, gy + arm);
      ctx.moveTo(gx + arm, gy - arm);
      ctx.lineTo(gx - arm, gy + arm);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  for (const point of replay.at(timeMs)) {
    const [cx, cy] = toCanvas(point.x, point.y);
    ctx.fillStyle = colorFor(replay, point.actor, teamColors);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const heading = (-(point.aimYawDeg ?? 0) * Math.PI) / 180;
    // Wing angle sits between equilateral (120°) and a narrow dart (135°).
    const tip = 10;
    const back = 7.5;
    const wing = (128 * Math.PI) / 180;
    ctx.moveTo(cx + Math.cos(heading) * tip, cy + Math.sin(heading) * tip);
    ctx.lineTo(
      cx + Math.cos(heading + wing) * back,
      cy + Math.sin(heading + wing) * back,
    );
    ctx.lineTo(
      cx + Math.cos(heading - wing) * back,
      cy + Math.sin(heading - wing) * back,
    );
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Each recent shot is a segment radiating from the nose that fades out.
    for (const shot of replay.fires(
      point.actor,
      timeMs - FIRE_FLASH_MS,
      timeMs,
    )) {
      const age = (timeMs - shot.timeMs) / FIRE_FLASH_MS;
      const shotHeading =
        shot.aimYawDeg === undefined
          ? heading
          : (-shot.aimYawDeg * Math.PI) / 180;
      ctx.strokeStyle = colorFor(replay, point.actor, teamColors);
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(
        cx + Math.cos(shotHeading) * tip,
        cy + Math.sin(shotHeading) * tip,
      );
      if (shot.hit) {
        // A shot that landed runs from the shooter to where the target stood.
        const [hx, hy] = toCanvas(shot.hit.x, shot.hit.y);
        ctx.lineTo(hx, hy);
      } else {
        ctx.lineTo(
          cx + Math.cos(shotHeading) * (tip + FIRE_LINE_LENGTH),
          cy + Math.sin(shotHeading) * (tip + FIRE_LINE_LENGTH),
        );
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const name = replay.players[point.actor]?.gamertag;
    if (name) {
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(name, cx, cy + 12);
      ctx.textBaseline = 'alphabetic';
    }

    // Shield is unreported until first damage, which means full; above 1 is overshield.
    const shield = point.shield ?? 1;
    const barWidth = 20;
    const barHeight = 4;
    const barX = cx - barWidth / 2;
    const barY = cy - 18;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(
      barX,
      barY,
      barWidth * Math.min(Math.max(shield, 0), 1),
      barHeight,
    );
    if (shield > 1) {
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(barX, barY, barWidth * Math.min(shield - 1, 1), barHeight);
    }
  }

  for (const o of replay.objectives(timeMs)) {
    const [ox, oy] = toCanvas(o.x, o.y);
    // A carried object rides above and beside its carrier so it does not hide the marker.
    const cx = o.state === 'carried' ? ox + 12 : ox;
    const cy = o.state === 'carried' ? oy - 12 : oy;
    ctx.globalAlpha = o.state === 'dropped' ? 0.85 : 1;
    if (o.kind === 'flag') {
      ctx.fillStyle =
        o.team !== undefined && teamColors.length > 0
          ? teamColors[o.team % teamColors.length]
          : '#d4d4d8';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.lineTo(cx, cy - 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx + 10, cy - 5);
      ctx.lineTo(cx, cy - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f4f4f5';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (hill) drawHillProgress(ctx, hill, teamColors, width);
  const roundScores = replay
    .scores(timeMs)
    .flatMap(({ team, roundScore }) =>
      team !== undefined && roundScore !== undefined
        ? [{ team, roundScore }]
        : [],
    );
  if (roundScores.length > 0)
    drawRoundScores(ctx, roundScores, teamColors, width);
}

export default function MiniMap({
  state,
  timeMs,
  teamColors,
  objectives,
  background,
}: {
  state: LoadState;
  timeMs: number;
  teamColors: string[];
  objectives: MapObjective[];
  background?: LoadedBackground;
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: CANVAS_SIZE, height: CANVAS_SIZE });

  // The canvas fills the container; the map is fitted inside it when drawing.
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  useEffect(() => {
    if (state.status === 'ready' && canvasRef.current) {
      draw(
        canvasRef.current,
        state.replay,
        state.replay.projectiles,
        timeMs,
        teamColors,
        view,
        objectives,
        size,
        window.devicePixelRatio || 1,
        background,
      );
    }
    // teamColors is a fresh array each render; join keeps the dependency stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, timeMs, view, objectives, background, size, teamColors.join()]);

  // Registered natively because React's wheel listeners are passive and
  // cannot stop the page from scrolling.
  const ready = state.status === 'ready';
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setView((v) =>
        zoomAbout(
          v,
          Math.exp(-e.deltaY * 0.0015),
          e.clientX - rect.left,
          e.clientY - rect.top,
        ),
      );
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [ready]);
  return (
    <Flex ref={setContainer} minW={0} minH={0} overflow="hidden">
      <Box
        position="relative"
        lineHeight={0}
        w={`${size.width}px`}
        h={`${size.height}px`}
      >
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 6,
            cursor: dragRef.current ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const last = dragRef.current;
            if (!last) return;
            const dx = e.clientX - last.x;
            const dy = e.clientY - last.y;
            dragRef.current = { x: e.clientX, y: e.clientY };
            setView((v) => ({
              ...v,
              panX: v.panX + dx,
              panY: v.panY + dy,
            }));
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onDoubleClick={() => setView(DEFAULT_VIEW)}
        />
        <Flex
          position="absolute"
          top={2}
          right={2}
          direction="column"
          align="center"
          gap={1}
          p={1}
          borderRadius="md"
          bg="blackAlpha.700"
          color="white"
        >
          <Text fontSize="xs" fontVariantNumeric="tabular-nums">
            {Math.round(view.zoom * 100)}%
          </Text>
          {/* Logarithmic so each step is the same relative zoom; top is zoomed in. */}
          <Slider.Root
            aria-label={['Zoom']}
            orientation="vertical"
            h="140px"
            min={Math.log(MIN_ZOOM)}
            max={Math.log(MAX_ZOOM)}
            step={0.01}
            value={[Math.log(view.zoom)]}
            onValueChange={({ value: [level] }) => {
              const target = Math.exp(level);
              setView((v) =>
                zoomAbout(v, target / v.zoom, size.width / 2, size.height / 2),
              );
            }}
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumbs />
            </Slider.Control>
          </Slider.Root>
          <Button
            size="2xs"
            variant="outline"
            color="white"
            onClick={() => setView(DEFAULT_VIEW)}
          >
            Reset
          </Button>
        </Flex>
      </Box>
    </Flex>
  );
}

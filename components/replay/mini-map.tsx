import { Box, Button, Flex, Slider } from '@chakra-ui/react';
import type { MapObjective, ReplayPoint } from '../../lib/film';
import { useEffect, useRef, useState } from 'react';
import { LoadedBackground, LoadState } from './types';
import {
  DEFAULT_VIEW,
  MIN_ZOOM,
  MAX_ZOOM,
  zoomAbout,
  drawReplay as draw,
  type MapView as View,
  type MapRenderer,
} from '@gravllift/halo-film-ui';

const CANVAS_SIZE = 600;

export default function MiniMap({
  state,
  points,
  timeMs,
  teamColors,
  objectives,
  background,
  draggable,
  leftOverlay,
  renderer,
  clock,
}: {
  state: LoadState;
  points: ReplayPoint[];
  timeMs: number;
  teamColors: string[];
  objectives: MapObjective[];
  background?: LoadedBackground;
  draggable: boolean;
  leftOverlay?: HTMLElement | null;
  renderer?: MapRenderer;
  clock?: { readonly current: number };
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    leftInset: 0,
  });

  // The canvas fills the container; the map is fitted inside it when drawing.
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      const leftInset = leftOverlay
        ? Math.max(
            0,
            Math.min(
              width,
              leftOverlay.getBoundingClientRect().right - rect.left,
            ),
          )
        : 0;
      if (width > 0 && height > 0) setSize({ width, height, leftInset });
    });
    observer.observe(container);
    if (leftOverlay) observer.observe(leftOverlay);
    return () => observer.disconnect();
  }, [container, leftOverlay]);

  useEffect(() => {
    if (state.status !== 'ready' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let frame = 0;
    let lastDrawnTime: number | undefined;
    const paint = () => {
      const currentTime = clock?.current ?? timeMs;
      if (currentTime === lastDrawnTime) return;
      lastDrawnTime = currentTime;
      draw(
        canvas,
        state.replay,
        state.replay.projectiles,
        state.replay.killFeed,
        clock ? state.replay.at(currentTime) : points,
        currentTime,
        teamColors,
        view,
        objectives,
        size,
        window.devicePixelRatio || 1,
        background,
        renderer,
      );
    };
    paint();
    if (clock) {
      const tick = () => {
        paint();
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(frame);
    // teamColors is a fresh array each render; join keeps the dependency stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state,
    points,
    timeMs,
    view,
    objectives,
    background,
    size,
    teamColors.join(),
    renderer,
    clock,
  ]);

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
          bottom={2}
          right={2}
          direction="column"
          align="center"
          gap={1}
          color="white"
        >
          <Slider.Root
            aria-label={['Zoom']}
            orientation="vertical"
            h="100px"
            min={Math.log(MIN_ZOOM)}
            max={Math.log(MAX_ZOOM)}
            step={0.01}
            value={[Math.log(view.zoom)]}
            onValueChange={({ value: [level] }) => {
              const target = Math.exp(level);
              setView((v) =>
                zoomAbout(
                  v,
                  target / v.zoom,
                  (size.width + size.leftInset) / 2,
                  size.height / 2,
                ),
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

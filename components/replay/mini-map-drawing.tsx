import { Flex, IconButton } from '@chakra-ui/react';
import { Hand, Pen, Pencil, Trash2, Undo2 } from 'lucide-react';
import { getStroke } from 'perfect-freehand';
import { useRef, useState, type PointerEvent } from 'react';
import {
  mapTransform,
  type MapBounds,
  type MapSize,
  type MapView,
} from '@gravllift/halo-film-ui';

const COLORS = ['#ffffff', '#f87171', '#facc15', '#4ade80', '#38bdf8'];

interface Stroke {
  color: string;
  path: string;
}

export default function MiniMapDrawing({
  bounds,
  size,
  view,
}: {
  bounds: MapBounds;
  size: MapSize;
  view: MapView;
}) {
  const [expanded, setExpanded] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const active = useRef<{
    pointerId: number;
    points: number[][];
    color: string;
    scale: number;
  } | null>(null);
  const { toScreen, scale } = mapTransform(bounds, size, view);
  const [originX, originY] = toScreen(0, 0);

  const updateStroke = (event: PointerEvent<SVGSVGElement>, last = false) => {
    const stroke = active.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    stroke.points.push([
      ((event.clientX - rect.left - originX) / scale) * stroke.scale,
      ((originY - (event.clientY - rect.top)) / scale) * stroke.scale,
    ]);
    const outline = getStroke(stroke.points, {
      size: 4,
      thinning: 0,
      last,
    });
    const next = {
      color: stroke.color,
      path: outline.length
        ? `M${outline
            .map((point) =>
              point.map((coordinate) => coordinate / stroke.scale).join(','),
            )
            .join('L')}Z`
        : '',
    };
    if (last) {
      setStrokes((previous) => [...previous, next]);
      active.current = null;
      setDraft(null);
    } else {
      setDraft(next);
    }
  };

  return (
    <>
      <svg
        aria-label="Map drawings"
        width={size.width}
        height={size.height}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: drawing ? 'auto' : 'none',
          touchAction: 'none',
          cursor: 'crosshair',
        }}
        onPointerDown={(event) => {
          if (!drawing || event.button !== 0 || active.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          active.current = {
            pointerId: event.pointerId,
            points: [],
            color,
            scale,
          };
          updateStroke(event);
        }}
        onPointerMove={(event) => updateStroke(event)}
        onPointerUp={(event) => updateStroke(event, true)}
        onPointerCancel={(event) => {
          if (active.current?.pointerId !== event.pointerId) return;
          active.current = null;
          setDraft(null);
        }}
        onLostPointerCapture={(event) => {
          if (active.current?.pointerId !== event.pointerId) return;
          active.current = null;
          setDraft(null);
        }}
      >
        <g transform={`matrix(${scale} 0 0 ${-scale} ${originX} ${originY})`}>
          {strokes.map((stroke, index) => (
            <path key={index} d={stroke.path} fill={stroke.color} />
          ))}
          {draft && <path d={draft.path} fill={draft.color} />}
        </g>
      </svg>
      <Flex
        role="toolbar"
        aria-label="Map drawing tools"
        position="absolute"
        bottom={2}
        left={`${size.leftInset + 8}px`}
        right="56px"
        w="fit-content"
        maxW={`calc(100% - ${size.leftInset + 64}px)`}
        wrap="wrap"
        align="center"
        gap={1}
        p={1}
        bg="blackAlpha.800"
        borderRadius="6px"
        color="white"
      >
        <IconButton
          aria-label={
            expanded ? 'Collapse drawing toolbar' : 'Expand drawing toolbar'
          }
          title={
            expanded ? 'Collapse drawing toolbar' : 'Expand drawing toolbar'
          }
          aria-expanded={expanded}
          variant="ghost"
          size="2xs"
          onClick={() => setExpanded((previous) => !previous)}
        >
          <Pen size={16} />
        </IconButton>
        {expanded && (
          <>
            <IconButton
              aria-label="Pan map"
              title="Pan map"
              aria-pressed={!drawing}
              variant={!drawing ? 'solid' : 'ghost'}
              size="2xs"
              onClick={() => setDrawing(false)}
            >
              <Hand size={16} />
            </IconButton>
            <IconButton
              aria-label="Draw on map"
              title="Draw on map"
              aria-pressed={drawing}
              variant={drawing ? 'solid' : 'ghost'}
              size="2xs"
              onClick={() => setDrawing(true)}
            >
              <Pencil size={16} />
            </IconButton>
            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Draw in ${swatch}`}
                title={`Draw in ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
                style={{
                  background: swatch,
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: '50%',
                  border:
                    color === swatch
                      ? '2px solid #111111'
                      : '2px solid transparent',
                  outline: color === swatch ? '2px solid white' : 'none',
                  cursor: 'pointer',
                }}
              />
            ))}
            <input
              type="color"
              aria-label="Drawing color"
              title="Drawing color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              style={{
                width: 24,
                height: 24,
                padding: 0,
                border: 0,
                cursor: 'pointer',
              }}
            />
            <IconButton
              aria-label="Undo drawing"
              title="Undo drawing"
              variant="ghost"
              size="2xs"
              disabled={!strokes.length}
              onClick={() => setStrokes((previous) => previous.slice(0, -1))}
            >
              <Undo2 size={16} />
            </IconButton>
            <IconButton
              aria-label="Clear drawings"
              title="Clear drawings"
              variant="ghost"
              size="2xs"
              disabled={!strokes.length}
              onClick={() => setStrokes([])}
            >
              <Trash2 size={16} />
            </IconButton>
          </>
        )}
      </Flex>
    </>
  );
}

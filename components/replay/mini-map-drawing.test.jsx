import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { getStroke } from 'perfect-freehand';
import { mapTransform } from '@gravllift/halo-film-ui';
import MiniMapDrawing from './mini-map-drawing';

jest.mock('@gravllift/halo-film-ui', () =>
  jest.requireActual('../../../../libs/halo-film-ui/src/view'),
);

jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  return {
    Flex: ({ children }) => React.createElement('div', null, children),
    IconButton: ({ children, size, variant, ...props }) =>
      React.createElement('button', props, children),
  };
});

const bounds = { minX: -10, maxX: 90, minY: 20, maxY: 120 };
const size = { width: 600, height: 600, leftInset: 100 };
const view = { zoom: 1, panX: 0, panY: 0 };

let host;
let root;
let previousAct;

beforeEach(() => {
  previousAct = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  host = document.createElement('div');
  root = createRoot(host);
  render();
  host.querySelector('svg').setPointerCapture = jest.fn();
});

afterEach(() => {
  act(() => root.unmount());
  if (previousAct)
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
  else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function render(props = {}) {
  act(() => {
    root.render(
      <MiniMapDrawing bounds={bounds} size={size} view={view} {...props} />,
    );
  });
}

function click(label) {
  act(() => host.querySelector(`[aria-label="${label}"]`).click());
}

function pointer(type, clientX, clientY, pointerId = 1) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
    button: { value: 0 },
  });
  act(() => host.querySelector('svg').dispatchEvent(event));
}

function stroke() {
  pointer('pointerdown', 200, 200);
  pointer('pointermove', 220, 240);
  pointer('pointerup', 250, 260);
}

it('starts collapsed and preserves the selected tool, color and drawings when reopened', () => {
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(host.querySelector('[aria-label="Expand drawing toolbar"]')
    .getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('[aria-label="Draw on map"]')).toBeNull();

  click('Expand drawing toolbar');
  expect(host.querySelector('[aria-label="Collapse drawing toolbar"]')
    .getAttribute('aria-expanded')).toBe('true');
  click('Draw on map');
  click('Draw in #f87171');
  stroke();
  const path = host.querySelector('g path').getAttribute('d');

  click('Collapse drawing toolbar');
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(host.querySelector('g path').getAttribute('d')).toBe(path);

  click('Expand drawing toolbar');
  expect(host.querySelector('[aria-label="Draw on map"]')
    .getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('[aria-label="Draw in #f87171"]')
    .getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('g path').getAttribute('d')).toBe(path);
});

it('defaults to pan and only captures drawing input in draw mode', () => {
  click('Expand drawing toolbar');
  expect(host.querySelector('svg').style.pointerEvents).toBe('none');
  stroke();
  expect(host.querySelector('g').children).toHaveLength(0);
  click('Draw on map');
  expect(host.querySelector('svg').style.pointerEvents).toBe('auto');
  stroke();
  expect(host.querySelector('g').children).toHaveLength(1);
  click('Pan map');
  expect(host.querySelector('svg').style.pointerEvents).toBe('none');
  expect(host.querySelector('g').children).toHaveLength(1);
});

it('captures map coordinates and keeps paths anchored through pan, zoom and resize', () => {
  click('Expand drawing toolbar');
  click('Draw on map');
  stroke();
  const { toScreen, scale } = mapTransform(bounds, size, view);
  const [originX, originY] = toScreen(0, 0);
  const points = [[200, 200], [220, 240], [250, 260]].map(
    ([horizontal, vertical]) => [
      horizontal - originX,
      originY - vertical,
    ],
  );
  const outline = getStroke(points, { size: 4, thinning: 0, last: true });
  const path = `M${outline
    .map((point) => point.map((coordinate) => coordinate / scale).join(','))
    .join('L')}Z`;
  expect(host.querySelector('g path').getAttribute('d')).toBe(path);

  const nextSize = { width: 360, height: 500, leftInset: 0 };
  const nextView = { zoom: 2, panX: 80, panY: -35 };
  const nextBounds = { ...bounds, maxX: 140 };
  render({ view: nextView, size: nextSize, bounds: nextBounds });
  const next = mapTransform(nextBounds, nextSize, nextView);
  const [nextX, nextY] = next.toScreen(0, 0);
  expect(host.querySelector('g').getAttribute('transform')).toBe(
    `matrix(${next.scale} 0 0 ${-next.scale} ${nextX} ${nextY})`,
  );
  expect(host.querySelector('g path').getAttribute('d')).toBe(path);
});

it('draws a thin continuous line on normalized maps rather than oversized end caps', () => {
  const normalizedBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  render({ bounds: normalizedBounds });
  click('Expand drawing toolbar');
  click('Draw on map');
  pointer('pointerdown', 200, 200);
  for (let horizontal = 210; horizontal <= 340; horizontal += 10)
    pointer('pointermove', horizontal, 200);
  pointer('pointerup', 350, 200);

  const coordinates = host.querySelector('g path').getAttribute('d')
    .match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi).map(Number);
  const horizontal = coordinates.filter((_, index) => index % 2 === 0);
  const vertical = coordinates.filter((_, index) => index % 2 === 1);
  const { scale } = mapTransform(normalizedBounds, size, view);
  expect((Math.max(...horizontal) - Math.min(...horizontal)) * scale)
    .toBeGreaterThan(145);
  expect((Math.max(...vertical) - Math.min(...vertical)) * scale)
    .toBeCloseTo(4, 1);
});

it('keeps individual stroke colors and supports undo and clear', () => {
  click('Expand drawing toolbar');
  click('Draw on map');
  click('Draw in #f87171');
  stroke();
  click('Draw in #38bdf8');
  stroke();
  expect([...host.querySelector('g').children].map((path) => path.getAttribute('fill')))
    .toEqual(['#f87171', '#38bdf8']);
  click('Undo drawing');
  expect(host.querySelector('g').children).toHaveLength(1);
  expect(host.querySelector('g path').getAttribute('fill')).toBe('#f87171');
  click('Clear drawings');
  expect(host.querySelector('g').children).toHaveLength(0);
  expect(host.querySelector('[aria-label="Undo drawing"]').disabled).toBe(true);
  expect(host.querySelector('[aria-label="Clear drawings"]').disabled).toBe(true);
});

it('discards canceled strokes and ignores other pointers', () => {
  click('Expand drawing toolbar');
  click('Draw on map');
  pointer('pointerdown', 200, 200);
  pointer('pointerup', 300, 300, 2);
  pointer('pointercancel', 300, 300, 2);
  pointer('pointermove', 220, 240);
  expect(host.querySelector('g').children).toHaveLength(1);
  pointer('pointercancel', 220, 240);
  expect(host.querySelector('g').children).toHaveLength(0);
  expect(host.querySelector('[aria-label="Undo drawing"]').disabled).toBe(true);
  stroke();
  expect(host.querySelector('[aria-label="Undo drawing"]').disabled).toBe(false);
});
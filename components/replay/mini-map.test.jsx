import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { drawReplay } from '@gravllift/halo-film-ui';
import MiniMap from './mini-map';

jest.mock('./mini-map-drawing', () => () => null);

jest.mock('@gravllift/halo-film-ui', () => ({
  DEFAULT_VIEW: { zoom: 1, panX: 0, panY: 0 },
  MIN_ZOOM: 0.25,
  MAX_ZOOM: 16,
  zoomAbout: jest.fn(),
  drawReplay: jest.fn(),
}));

jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = React.forwardRef(({ children }, ref) =>
    React.createElement('div', { ref }, children),
  );
  return {
    Box: component,
    Flex: component,
    Button: ({ children, onClick }) =>
      React.createElement('button', { onClick }, children),
    Slider: {
      Root: component,
      Control: component,
      Track: component,
      Range: component,
      Thumbs: component,
    },
  };
});

async function mount(clock) {
  const previousObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    'ResizeObserver',
  );
  const previousAct = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
  const callbacks = new Map();
  let nextId = 0;
  const request = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    });
  const cancel = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((id) => callbacks.delete(id));
  const replay = {
    projectiles: [],
    killFeed: [],
    at: jest.fn((timeMs) => [{ actor: 0, x: timeMs, y: 0 }]),
  };
  const points = [{ actor: 0, x: 0, y: 0 }];
  const root = createRoot(document.createElement('div'));
  drawReplay.mockClear();
  await act(async () =>
    root.render(
      <MiniMap
        state={{ status: 'ready', replay }}
        points={points}
        timeMs={0}
        clock={clock}
        teamColors={[]}
        objectives={[]}
        draggable
      />,
    ),
  );
  return {
    callbacks,
    request,
    cancel,
    replay,
    points,
    step() {
      const [id, callback] = callbacks.entries().next().value;
      callbacks.delete(id);
      act(() => callback(0));
    },
    cleanup() {
      act(() => root.unmount());
      request.mockRestore();
      cancel.mockRestore();
      if (previousObserver)
        Object.defineProperty(globalThis, 'ResizeObserver', previousObserver);
      else Reflect.deleteProperty(globalThis, 'ResizeObserver');
      if (previousAct)
        Object.defineProperty(
          globalThis,
          'IS_REACT_ACT_ENVIRONMENT',
          previousAct,
        );
      else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    },
  };
}

it('draws the live clock between React updates and skips unchanged frames', async () => {
  const clock = { current: 0 };
  const map = await mount(clock);
  try {
    expect(drawReplay.mock.calls.at(-1)[5]).toBe(0);
    const initialCalls = drawReplay.mock.calls.length;
    map.step();
    expect(drawReplay.mock.calls.length).toBe(initialCalls);
    clock.current = 16;
    map.step();
    expect(map.replay.at).toHaveBeenLastCalledWith(16);
    expect(drawReplay.mock.calls.at(-1)[5]).toBe(16);
    expect(drawReplay.mock.calls.at(-1)[4]).toEqual([
      { actor: 0, x: 16, y: 0 },
    ]);
    map.step();
    expect(drawReplay.mock.calls.length).toBe(initialCalls + 1);
    expect(map.callbacks.size).toBe(1);
  } finally {
    map.cleanup();
  }
  expect(map.callbacks.size).toBe(0);
});

it('still supports a snapshot-only caller without starting an animation loop', async () => {
  const map = await mount(undefined);
  try {
    expect(drawReplay.mock.calls.at(-1)[4]).toBe(map.points);
    expect(map.replay.at).not.toHaveBeenCalled();
    expect(map.request).not.toHaveBeenCalled();
  } finally {
    map.cleanup();
  }
});

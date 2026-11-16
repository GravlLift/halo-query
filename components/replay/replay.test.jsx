import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFilm } from '../../lib/film';
import Replay from './replay';
import { createReplayDecoder } from './replay-decoder';

jest.mock('../../lib/film', () => ({ loadFilm: jest.fn() }));
jest.mock('./replay-decoder', () => ({
  createReplayDecoder: jest.fn(() => ({
    decode: jest.fn(),
    terminate: jest.fn(),
  })),
}));
jest.mock('../../lib/contexts/api-client-contexts', () => {
  const haloInfiniteClient = {
    spectateMatch: async () => ({
      BlobStoragePathPrefix: 'film',
      CustomData: {
        Chunks: [
          {
            ChunkType: 2,
            ChunkStartTimeOffsetMilliseconds: 0,
            DurationMilliseconds: 100000,
          },
        ],
      },
    }),
    getFilmChunk: async () => new Uint8Array(),
  };
  return { useApiClients: () => ({ haloInfiniteClient }) };
});
jest.mock('../match/team-presets', () => ({ useTeamPresets: () => [] }));
jest.mock('./mini-map', () => () => null);
jest.mock('./team-panel', () => ({ TeamPanel: () => null }));
jest.mock('./kill-feed', () => ({ KillFeed: () => null }));
jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = React.forwardRef(
    ({ children, role, 'aria-label': label, 'data-testid': testId, w }, ref) =>
      React.createElement(
        'div',
        { role, 'aria-label': label, 'data-testid': testId, 'data-width': w, ref },
        children,
      ),
  );
  const button = ({ children, onClick, 'aria-label': label }) =>
    React.createElement('button', { onClick, 'aria-label': label }, children);
  const slider = ({ children, onValueChange, getAriaValueText, max, value }) =>
    React.createElement(
      'div',
      {
        'data-max': max,
        'data-value': value[0],
        'data-value-text': getAriaValueText({ value: value[0], index: 0 }),
      },
      React.createElement('button', {
        onClick: () => onValueChange({ value: [70000] }),
        'aria-label': 'Seek 70',
      }),
      React.createElement('button', {
        onClick: () => onValueChange({ value: [80000] }),
        'aria-label': 'Seek 80',
      }),
      React.createElement('button', {
        onClick: () => onValueChange({ value: [95000] }),
        'aria-label': 'Seek 95',
      }),
      React.createElement('button', {
        onClick: () => onValueChange({ value: [5000] }),
        'aria-label': 'Seek 5',
      }),
      children,
    );
  return {
    Box: component,
    Flex: component,
    Grid: component,
    Text: component,
    Button: button,
    Spinner: component,
    Slider: {
      Root: slider,
      Control: component,
      Track: component,
      Range: component,
      Thumbs: component,
    },
  };
});

it('prioritizes unloaded seeks and shows an overlay until the latest target is ready', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const replay = {
    startMs: 0,
    endMs: 20000,
    players: [],
    map: { objectives: [] },
    at: () => [],
    scores: () => [],
    killFeed: [],
    projectiles: [],
  };
  let options;
  let rejectLoading;
  loadFilm.mockImplementation((received) => {
    options = received;
    received.onReplay(replay, false);
    return new Promise((resolve, reject) => {
      rejectLoading = reject;
    });
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));

  expect(container.querySelector('[data-max="100000"]')).not.toBeNull();
  const loadedRange = () => container.querySelector('[data-testid="replay-loaded-range"]');
  const playedRange = () => container.querySelector('[data-testid="replay-played-range"]');
  expect(loadedRange().getAttribute('data-width')).toBe('20%');
  expect(playedRange().getAttribute('data-width')).toBe('0%');
  expect(container.querySelector('[data-value-text]').getAttribute('data-value-text'))
    .toBe('0:00 of 1:40, loaded through 0:20');
  const click = (name) =>
    act(() => container.querySelector(`[aria-label="${name}"]`).click());
  click('Seek 70');
  expect(options.getPriorityTime()).toBe(70000);
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(playedRange().getAttribute('data-width')).toBe('0%');
  click('Seek 5');
  expect(options.getPriorityTime()).toBeUndefined();
  expect(container.querySelector('[role="status"]')).toBeNull();
  click('Seek 70');
  click('Seek 80');
  expect(options.getPriorityTime()).toBe(80000);
  act(() => options.onReplay({ ...replay, endMs: 75000 }, false));
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(loadedRange().getAttribute('data-width')).toBe('75%');
  expect(playedRange().getAttribute('data-width')).toBe('5%');
  act(() => options.onReplay({ ...replay, endMs: 90000 }, false));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('[data-value="80000"]')).not.toBeNull();
  expect(loadedRange().getAttribute('data-width')).toBe('90%');
  expect(playedRange().getAttribute('data-width')).toBe('80%');
  expect(options.getPriorityTime()).toBeUndefined();

  click('Seek 5');
  expect(container.querySelector('[data-value="5000"]')).not.toBeNull();
  expect(container.querySelector('[role="status"]')).toBeNull();
  click('Seek 95');
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => rejectLoading(new Error('Network failed')));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.textContent).toContain('Network failed');
  expect(options.getPriorityTime()).toBeUndefined();
  expect(
    createReplayDecoder.mock.results.at(-1).value.terminate,
  ).toHaveBeenCalled();
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('terminates the decoder when the replay is unmounted during a download', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  loadFilm.mockImplementation(() => new Promise(() => {}));
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
  const decoder = createReplayDecoder.mock.results.at(-1).value;
  expect(decoder.terminate).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(decoder.terminate).toHaveBeenCalled();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('starts at the first spawn without resetting later seeks', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const replay = {
    startMs: 0,
    firstSpawnMs: 8000,
    endMs: 20000,
    players: [],
    map: { objectives: [] },
    at: () => [],
    scores: () => [],
    killFeed: [],
    projectiles: [],
  };
  let options;
  loadFilm.mockImplementation((received) => {
    options = received;
    received.onReplay(replay, false);
    return new Promise(() => {});
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
  expect(container.querySelector('[data-value="8000"]')).not.toBeNull();
  act(() => container.querySelector('[aria-label="Seek 5"]').click());
  expect(container.querySelector('[data-value="5000"]')).not.toBeNull();
  act(() => options.onReplay({ ...replay, endMs: 90000 }, false));
  expect(container.querySelector('[data-value="5000"]')).not.toBeNull();
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('cancels the playback frame when the replay is unmounted', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);
  const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const replay = {
    startMs: 0,
    endMs: 100000,
    players: [],
    map: { objectives: [] },
    at: () => [],
    scores: () => [],
    killFeed: [],
    projectiles: [],
  };
  loadFilm.mockImplementation((options) => {
    options.onReplay(replay, true);
    return Promise.resolve(replay);
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
  act(() => container.querySelector('[aria-label="Play"]').click());
  expect(requestFrame).toHaveBeenCalled();
  act(() => root.unmount());
  expect(cancelFrame).toHaveBeenCalledWith(123);
  requestFrame.mockRestore();
  cancelFrame.mockRestore();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('releases playback and the decoder when navigation starts while still mounted', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);
  const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const navigation = new AbortController();
  const replay = {
    startMs: 0,
    endMs: 100000,
    players: [],
    map: { objectives: [] },
    at: () => [],
    scores: () => [],
    killFeed: [],
    projectiles: [],
  };
  let options;
  loadFilm.mockImplementation((received) => {
    options = received;
    received.onReplay(replay, false);
    return new Promise(() => {});
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} navigationSignal={navigation.signal} />));
  const decoder = createReplayDecoder.mock.results.at(-1).value;
  act(() => container.querySelector('[aria-label="Play"]').click());
  expect(requestFrame).toHaveBeenCalled();
  act(() => navigation.abort());
  expect(decoder.terminate).toHaveBeenCalled();
  expect(cancelFrame).toHaveBeenCalledWith(123);
  expect(container.querySelector('[data-max]')).toBeNull();
  act(() => options.onReplay(replay, true));
  expect(container.querySelector('[data-max]')).toBeNull();
  act(() => root.unmount());
  requestFrame.mockRestore();
  cancelFrame.mockRestore();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('does not start decoding after navigation has already begun', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const navigation = new AbortController();
  navigation.abort();
  const decoderCount = createReplayDecoder.mock.calls.length;
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} navigationSignal={navigation.signal} />));
  expect(createReplayDecoder).toHaveBeenCalledTimes(decoderCount);
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('marks the entire track loaded when the final snapshot arrives', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const replay = {
    startMs: 0,
    endMs: 100000,
    players: [],
    map: { objectives: [] },
    at: () => [],
    scores: () => [],
    killFeed: [],
    projectiles: [],
  };
  loadFilm.mockImplementation((options) => {
    options.onReplay(replay, true);
    return Promise.resolve(replay);
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
  expect(
    container.querySelector('[data-testid="replay-loaded-range"]').getAttribute('data-width'),
  ).toBe('100%');
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFilm } from '../../lib/film';
import Replay from './replay';
import { createReplayDecoder } from './replay-decoder';
import { KillFeed } from './kill-feed';
import MiniMap from './mini-map';
import { TeamPanel } from './team-panel';

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
jest.mock('./mini-map', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));
jest.mock('./team-panel', () => ({ TeamPanel: jest.fn(() => null) }));
jest.mock('./kill-feed', () => ({ KillFeed: jest.fn(() => null) }));
jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = React.forwardRef(
    (
      {
        children,
        role,
        'aria-label': label,
        'data-testid': testId,
        w,
        onPointerMove,
        onPointerLeave,
      },
      ref,
    ) =>
      React.createElement(
        'div',
        {
          role,
          'aria-label': label,
          'data-testid': testId,
          'data-width': w,
          onPointerMove,
          onPointerLeave,
          ref,
        },
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

it.each([
  [false, ['7', '4', '99']],
  [true, ['2', '1', '99']],
])(
  'aligns overall scores with team card sides (round wins: %s)',
  async (roundBased, expected) => {
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      'IS_REACT_ACT_ENVIRONMENT',
    );
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
    });
    const scores = Object.freeze([
      { team: 1, score: 4, ...(roundBased ? { roundsWon: 1 } : {}) },
      { team: undefined, score: 99 },
      { team: 0, score: 7, ...(roundBased ? { roundsWon: 2 } : {}) },
    ]);
    const replay = {
      startMs: 0,
      endMs: 100000,
      players: [
        { actor: 0, team: 1 },
        { actor: 1, team: 0 },
      ],
      map: { objectives: [] },
      at: () => [],
      scores: () => scores,
      killFeed: [],
      projectiles: [],
    };
    loadFilm.mockImplementation((options) => {
      options.onReplay(replay, true);
      return Promise.resolve(replay);
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(<Replay match={{ MatchId: 'match' }} />),
      );
      const scoreboard = container.firstElementChild.firstElementChild;
      expect(
        Array.from(scoreboard.children, (element) => element.textContent),
      ).toEqual(expected);
      expect(
        TeamPanel.mock.calls.slice(-2).map(([props]) => props.players[0].team),
      ).toEqual([0, 1]);
      expect(scores.map((score) => score.team)).toEqual([1, undefined, 0]);
    } finally {
      act(() => root.unmount());
      if (previous)
        Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previous);
      else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  },
);

it('keeps the canvas clock current without rerendering controls every frame', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const now = jest.spyOn(performance, 'now').mockReturnValue(1000);
  const requestFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockReturnValue(123);
  const cancelFrame = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => {});
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
  try {
    await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
    act(() => container.querySelector('[aria-label="Play"]').click());
    const initialCalls = MiniMap.mock.calls.length;
    const step = (timestamp) =>
      act(() => requestFrame.mock.calls.at(-1)[0](timestamp));
    step(1016);
    expect(MiniMap.mock.calls.length).toBe(initialCalls);
    expect(MiniMap.mock.calls.at(-1)[0].clock.current).toBe(16);
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(0);
    step(1116);
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(116);
    step(1180);
    expect(MiniMap.mock.calls.at(-1)[0].clock.current).toBe(180);
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(116);
    act(() => container.querySelector('[aria-label="Pause"]').click());
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(180);
    act(() => container.querySelector('[aria-label="Seek 5"]').click());
    expect(MiniMap.mock.calls.at(-1)[0].clock.current).toBe(5000);
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(5000);
    act(() => container.querySelector('[aria-label="Play"]').click());
    step(200000);
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(100000);
    expect(container.querySelector('[aria-label="Play"]')).not.toBeNull();
    act(() => container.querySelector('[aria-label="Play"]').click());
    expect(MiniMap.mock.calls.at(-1)[0].clock.current).toBe(0);
    expect(MiniMap.mock.calls.at(-1)[0].timeMs).toBe(0);
  } finally {
    act(() => root.unmount());
    now.mockRestore();
    requestFrame.mockRestore();
    cancelFrame.mockRestore();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});

it('keeps the kill feed seek handler stable across playback ticks', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const requestFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockReturnValue(123);
  const cancelFrame = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => {});
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
  try {
    await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
    const seek = KillFeed.mock.calls.at(-1)[0].onSeek;
    act(() => container.querySelector('[aria-label="Play"]').click());
    const tick = requestFrame.mock.calls.at(-1)[0];
    act(() => tick(performance.now() + 16));
    expect(KillFeed.mock.calls.at(-1)[0].onSeek).toBe(seek);
  } finally {
    act(() => root.unmount());
    requestFrame.mockRestore();
    cancelFrame.mockRestore();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
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
  const loadedRange = () =>
    container.querySelector('[data-testid="replay-loaded-range"]');
  const playedRange = () =>
    container.querySelector('[data-testid="replay-played-range"]');
  const pendingOverlay = () =>
    container.querySelector('[aria-label="Loading requested replay position"]');
  expect(loadedRange().getAttribute('data-width')).toBe('20%');
  expect(playedRange().getAttribute('data-width')).toBe('0%');
  expect(
    container
      .querySelector('[data-value-text]')
      .getAttribute('data-value-text'),
  ).toBe('0:00 of 1:40, loaded through 0:20');
  const loadStatus = container.querySelector(
    '[data-testid="replay-loading-status"]',
  );
  expect(loadStatus.parentElement.getAttribute('data-testid')).toBe(
    'replay-map-container',
  );
  const click = (name) =>
    act(() => container.querySelector(`[aria-label="${name}"]`).click());
  click('Seek 70');
  expect(options.getPriorityTime()).toBe(70000);
  expect(pendingOverlay()).not.toBeNull();
  expect(playedRange().getAttribute('data-width')).toBe('0%');
  click('Seek 5');
  expect(options.getPriorityTime()).toBeUndefined();
  expect(pendingOverlay()).toBeNull();
  click('Seek 70');
  click('Seek 80');
  expect(options.getPriorityTime()).toBe(80000);
  act(() => options.onReplay({ ...replay, endMs: 75000 }, false));
  expect(pendingOverlay()).not.toBeNull();
  expect(loadedRange().getAttribute('data-width')).toBe('75%');
  expect(playedRange().getAttribute('data-width')).toBe('5%');
  act(() => options.onReplay({ ...replay, endMs: 90000 }, false));
  expect(pendingOverlay()).toBeNull();
  expect(container.querySelector('[data-value="80000"]')).not.toBeNull();
  expect(loadedRange().getAttribute('data-width')).toBe('90%');
  expect(playedRange().getAttribute('data-width')).toBe('80%');
  expect(options.getPriorityTime()).toBeUndefined();

  click('Seek 5');
  expect(container.querySelector('[data-value="5000"]')).not.toBeNull();
  expect(pendingOverlay()).toBeNull();
  click('Seek 95');
  expect(pendingOverlay()).not.toBeNull();
  await act(async () => rejectLoading(new Error('Network failed')));
  expect(pendingOverlay()).toBeNull();
  expect(container.textContent).toContain('Network failed');
  expect(options.getPriorityTime()).toBeUndefined();
  expect(
    createReplayDecoder.mock.results.at(-1).value.terminate,
  ).toHaveBeenCalled();
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('matches seek hover endpoints to the slider thumb travel and pauses playback on seek', async () => {
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
  try {
    await act(async () => root.render(<Replay match={{ MatchId: 'match' }} />));
    const seekTrack = container.querySelector(
      '[data-testid="replay-seek-track"]',
    );
    jest.spyOn(seekTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
    });
    act(() =>
      seekTrack.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 990 }),
      ),
    );
    expect(seekTrack.lastElementChild.textContent).toBe('1:40');
    act(() => container.querySelector('[aria-label="Play"]').click());
    act(() => container.querySelector('[aria-label="Seek 70"]').click());
    expect(container.querySelector('[aria-label="Play"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
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
  const requestFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockReturnValue(123);
  const cancelFrame = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => {});
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
  const requestFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockReturnValue(123);
  const cancelFrame = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => {});
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
  await act(async () =>
    root.render(
      <Replay
        match={{ MatchId: 'match' }}
        navigationSignal={navigation.signal}
      />,
    ),
  );
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
  await act(async () =>
    root.render(
      <Replay
        match={{ MatchId: 'match' }}
        navigationSignal={navigation.signal}
      />,
    ),
  );
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
    container
      .querySelector('[data-testid="replay-loaded-range"]')
      .getAttribute('data-width'),
  ).toBe('100%');
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MediaPanel } from './media-panel';
import { MediaItem } from './media-item';
import { useMediaSync } from './use-media-sync';
import { bindFileMediaTiming, FileMediaItem } from './file-media-item';
import { setTimingsrc } from 'timingsrc';

jest.mock('./media-item', () => ({ MediaItem: jest.fn(() => null) }));
jest.mock('./media-source-dialog', () => ({
  MediaSourceDialog: ({ onSelect }) => (
    <button onClick={() => onSelect({ kind: 'file', file: { name: 'test.mp4' } })}>
      Select media
    </button>
  ),
}));

describe('media audio hover card', () => {
  let container;
  let root;
  let originalScrollTo;

  beforeEach(() => {
    jest.useFakeTimers();
    MediaItem.mockClear();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = jest.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    HTMLElement.prototype.scrollTo = originalScrollTo;
    delete globalThis.ResizeObserver;
  });

  it('stays open while the pointer moves from the trigger into the card', async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={defaultSystem}>
          <MediaPanel
            clock={{ current: 0 }}
            timeMs={0}
            playing={false}
            speed={1}
            waiting={false}
            aligning={false}
            onAligningChange={() => {}}
            match={{ MatchId: 'match', MatchInfo: { StartTime: '2024-01-01' } }}
            matchDurationMs={0}
          />
        </ChakraProvider>,
      );
    });
    await act(async () => {
      container.querySelector('button').click();
      container.querySelector('button').click();
    });
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([1, 0]);
    const trigger = container.querySelector('[aria-label="Mute media"]');
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    const card = document.querySelector('[data-scope="hover-card"][data-part="content"]');
    expect(card.dataset.state).toBe('open');
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
      card.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(card.dataset.state).toBe('open');
    const sourceTrigger = document.querySelector('[aria-label="Audio source"]');
    await act(async () => {
      sourceTrigger.click();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(sourceTrigger.getAttribute('aria-expanded')).toBe('true');
    const secondSource = card.querySelector('[role="option"][data-value="1"]');
    expect(secondSource).not.toBeNull();
    await act(async () => {
      secondSource.click();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(Array.from(card.querySelector('select').selectedOptions, (option) => option.value)).toEqual(['0', '1']);
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([1, 1]);
    await act(async () => trigger.click());
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([0, 0]);
    await act(async () => trigger.click());
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([1, 1]);
    expect(sourceTrigger.getAttribute('aria-expanded')).toBe('true');
    const firstSource = card.querySelector('[role="option"][data-value="0"]');
    await act(async () => {
      firstSource.click();
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(Array.from(card.querySelector('select').selectedOptions, (option) => option.value)).toEqual(['1']);
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([0, 1]);
    await act(async () => {
      card.querySelector('[role="option"][data-value="1"]').click();
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([0, 0]);
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Select media').click();
    });
    expect(MediaItem.mock.calls.slice(-3).map(([item]) => item.volume)).toEqual([0, 0, 0]);
    await act(async () => {
      card.querySelector('[role="option"][data-value="1"]').click();
      await jest.advanceTimersByTimeAsync(50);
    });
    const [firstItem] = MediaItem.mock.calls.slice(-3).map(([item]) => item);
    await act(async () => {
      firstItem.onRemove();
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(MediaItem.mock.calls.slice(-2).map(([item]) => item.volume)).toEqual([1, 0]);
    expect(card.querySelector('[role="option"][data-value="1"]').getAttribute('aria-selected')).toBe('true');
    await act(async () => {
      sourceTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(card.dataset.state).toBe('open');
    await act(async () => {
      card.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(700);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(card.dataset.state).toBe('closed');

  });

  it('logs seek commands, drift, cadence, and reported seek completion', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const clock = { current: 2000 };
    const player = {
      getCurrentTime: () => 0,
      getDuration: () => 100,
      isPaused: () => false,
      isSeeking: () => false,
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      getRate: () => 1,
      setRate: jest.fn(),
      setVolume: jest.fn(),
    };
    let onSeeked;
    const Sync = ({ timeMs }) => {
      ({ onPlayerSeeked: onSeeked } = useMediaSync({
        player, sourceLabel: 'video.mp4', clock, timeMs, playing: true,
        speed: 1, waiting: false, aligning: false, volume: 1, offset: 0,
        onUserOffset: () => {},
      }));
      return null;
    };
    try {
      await act(async () => root.render(<Sync timeMs={2000} />));
      expect(player.seek).toHaveBeenCalledWith(2);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('video.mp4'),
        expect.objectContaining({
          trigger: 'state/time update', currentSec: 0, targetSec: 2,
          driftSec: 2, previousSeekMs: null, playerPaused: false,
        }),
      );
      await act(async () => jest.advanceTimersByTime(300));
      await act(async () => onSeeked());
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('seeked event'),
        expect.objectContaining({ programmatic: true, sinceCommandMs: 300 }),
      );
      clock.current = 3000;
      await act(async () => root.render(<Sync timeMs={3000} />));
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('drift 3.000s'),
        expect.objectContaining({ previousSeekMs: 300, targetSec: 3 }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it('does not retarget an HTML media element while a seek is in progress', async () => {
    const media = document.createElement('video');
    let position = 0;
    let seeking = false;
    const seeks = jest.fn((next) => { position = next; seeking = true; });
    Object.defineProperties(media, {
      currentTime: { get: () => position, set: seeks },
      duration: { get: () => 100 },
      seeking: { get: () => seeking },
      paused: { get: () => false },
    });
    media.play = jest.fn(() => Promise.resolve());
    media.pause = jest.fn();
    const start = Date.now();
    const timing = new EventTarget();
    timing.query = () => ({ position: 10 + (Date.now() - start) / 1000, velocity: 1, acceleration: 0, timestamp: Date.now() / 1000 });
    const detach = bindFileMediaTiming(media, timing, 0, setTimingsrc);
    try {
      await act(async () => jest.advanceTimersByTimeAsync(5000));
      expect(seeks).toHaveBeenCalledTimes(1);
      seeking = false;
      await act(async () => jest.advanceTimersByTimeAsync(100));
      expect(seeks).toHaveBeenCalledTimes(2);
      await act(async () => jest.advanceTimersByTimeAsync(5000));
      expect(seeks).toHaveBeenCalledTimes(2);
      seeking = false;
      await act(async () => jest.advanceTimersByTimeAsync(100));
      expect(seeks).toHaveBeenCalledTimes(2);
    } finally {
      detach();
    }
  });

  it('shares the replay clock and updates it on playback changes and paused seeks', async () => {
    const clock = { current: 10000 };
    const props = {
      clock, timeMs: 10000, playing: false, speed: 1, waiting: false,
      aligning: false, onAligningChange: () => {},
      match: { MatchId: 'match', MatchInfo: { StartTime: '2024-01-01' } },
      matchDurationMs: 100000,
    };
    const render = (next) => root.render(
      <ChakraProvider value={defaultSystem}><MediaPanel {...next} /></ChakraProvider>,
    );
    await act(async () => render(props));
    await act(async () => {
      container.querySelector('button').click();
      container.querySelector('button').click();
    });
    const items = MediaItem.mock.calls.slice(-2).map(([item]) => item);
    expect(items[0].timingObject).toBe(items[1].timingObject);
    const timing = items[0].timingObject;
    expect(timing.query()).toMatchObject({ position: 10, velocity: 0 });
    const update = jest.spyOn(timing, 'update');
    await act(async () => render({ ...props, playing: true }));
    expect(timing.query().velocity).toBe(1);
    update.mockClear();
    await act(async () => render({ ...props, playing: true, timeMs: 10010 }));
    expect(update).not.toHaveBeenCalled();
    await act(async () => render({ ...props, playing: true, speed: 2 }));
    expect(timing.query().velocity).toBe(2);
    await act(async () => render({ ...props, playing: true, waiting: true }));
    expect(timing.query().velocity).toBe(0);
    clock.current = 12000;
    await act(async () => render({ ...props, timeMs: 12000 }));
    expect(timing.query()).toMatchObject({ position: 12, velocity: 0 });
    update.mockRestore();
  });

  it('applies offsets and media boundaries while paused and detaches cleanly', () => {
    const media = document.createElement('video');
    let position = 0;
    let replayPosition = 10;
    const seeks = jest.fn((next) => { position = next; });
    Object.defineProperties(media, {
      currentTime: { get: () => position, set: seeks },
      duration: { get: () => 100 },
      seeking: { get: () => false },
      paused: { get: () => true },
    });
    media.pause = jest.fn();
    const timing = new EventTarget();
    timing.query = () => ({ position: replayPosition, velocity: 0, acceleration: 0, timestamp: 0 });
    const detach = bindFileMediaTiming(media, timing, 5, setTimingsrc);
    expect(position).toBe(15);
    replayPosition = 98;
    timing.dispatchEvent(new Event('change'));
    expect(position).toBe(100);
    replayPosition = -10;
    timing.dispatchEvent(new Event('change'));
    expect(position).toBe(0);
    detach();
    seeks.mockClear();
    replayPosition = 20;
    timing.dispatchEvent(new Event('change'));
    expect(seeks).not.toHaveBeenCalled();
  });

  it('detaches during manual alignment and uses the user scrub as the offset', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    const pause = HTMLMediaElement.prototype.pause;
    URL.createObjectURL = jest.fn(() => 'blob:test');
    URL.revokeObjectURL = jest.fn();
    HTMLMediaElement.prototype.pause = jest.fn();
    const storageKey = 'halo-query:media-offset:match:clip.mp4:4:1';
    const saved = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, '0');
    const file = new File(['data'], 'clip.mp4', { type: 'video/mp4', lastModified: 1 });
    const timing = new EventTarget();
    timing.query = () => ({ position: 10, velocity: 0, acceleration: 0, timestamp: 0 });
    const props = {
      file, timingObject: timing, matchId: 'match', matchStartMs: 0,
      matchDurationMs: 100000, onRemove: () => {}, clock: { current: 10000 },
      timeMs: 10000, playing: false, speed: 1, waiting: false, aligning: false,
      volume: 1,
    };
    const render = (next) => root.render(
      <ChakraProvider value={defaultSystem}><FileMediaItem {...next} /></ChakraProvider>,
    );
    try {
      await act(async () => render(props));
      const video = container.querySelector('video');
      Object.defineProperty(video, 'duration', { value: 100 });
      await act(async () => video.dispatchEvent(new Event('loadedmetadata', { bubbles: true })));
      await act(async () => render({ ...props, aligning: true }));
      await act(async () => {
        video.currentTime = 20;
        video.dispatchEvent(new Event('seeking', { bubbles: true }));
        video.dispatchEvent(new Event('seeked', { bubbles: true }));
      });
      expect(Number(container.querySelector('input').value)).toBe(10);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('clip.mp4'),
        expect.objectContaining({ targetSec: 20, replaySec: 10, aligning: true }),
      );
      await act(async () => render(props));
      expect(video.currentTime).toBe(20);
    } finally {
      await act(async () => root.render(null));
      if (saved === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, saved);
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      HTMLMediaElement.prototype.pause = pause;
      log.mockRestore();
    }
  });
});
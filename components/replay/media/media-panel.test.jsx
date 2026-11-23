import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MediaPanel } from './media-panel';

jest.mock('./media-item', () => ({ MediaItem: () => null }));
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
    expect(card.querySelector('select').value).toBe('1');
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
});
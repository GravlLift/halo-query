import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { KillFeed } from './kill-feed';

const mockNames = jest.fn();

jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = React.forwardRef(
    ({ children, as, onClick, onScroll, ...props }, ref) =>
      React.createElement(
        as || 'div',
        {
          ref,
          onClick,
          onScroll,
          'data-feed-index': props['data-feed-index'],
          'aria-current': props['aria-current'],
          'aria-label': props['aria-label'],
        },
        children,
      ),
  );
  return {
    Box: component,
    Flex: component,
    Text: ({ children, color, as }) => {
      if (typeof children === 'string' && children.startsWith('Victim'))
        mockNames(children, color);
      return React.createElement(as || 'div', {}, children);
    },
  };
});

async function setup() {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  const entries = Array.from({ length: 167 }, (_, index) => ({
    timeMs: (index + 1) * 100,
    killer: { xuid: `killer${index}`, gamertag: `Killer${index}`, team: 0 },
    victim: { xuid: `victim${index}`, gamertag: `Victim${index}`, team: 1 },
    damageAssists: [],
  }));
  const onSeek = jest.fn();
  const render = (timeMs, teamColors = ['blue', 'red'], seek = onSeek) =>
    act(async () =>
      root.render(
        <KillFeed
          entries={entries}
          timeMs={timeMs}
          teamColors={teamColors}
          visible
          onSeek={seek}
        />,
      ),
    );
  await render(0);
  return {
    container,
    entries,
    onSeek,
    render,
    cleanup() {
      act(() => root.unmount());
      if (previous)
        Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previous);
      else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    },
  };
}

it('rerenders only changed rows as playback advances through a full kill feed', async () => {
  const feed = await setup();
  try {
    mockNames.mockClear();
    await feed.render(50);
    expect(mockNames).not.toHaveBeenCalled();
    await feed.render(150);
    expect(mockNames.mock.calls.map(([name]) => name)).toEqual(['Victim0']);
    mockNames.mockClear();
    await feed.render(250);
    expect(mockNames.mock.calls.map(([name]) => name)).toEqual([
      'Victim0',
      'Victim1',
    ]);
    expect(
      feed.container
        .querySelector('[aria-current="true"]')
        .getAttribute('data-feed-index'),
    ).toBe('1');
    mockNames.mockClear();
    await feed.render(275);
    expect(mockNames).not.toHaveBeenCalled();
  } finally {
    feed.cleanup();
  }
});

it('preserves seeks and refreshes rows when callbacks or team colors change', async () => {
  const feed = await setup();
  try {
    await feed.render(150);
    act(() => feed.container.querySelector('[data-feed-index="5"]').click());
    expect(feed.onSeek).toHaveBeenLastCalledWith(600);
    const replacement = jest.fn();
    mockNames.mockClear();
    await feed.render(150, ['blue', 'orange'], replacement);
    expect(mockNames).toHaveBeenCalledWith('Victim5', 'orange');
    act(() => feed.container.querySelector('[data-feed-index="5"]').click());
    expect(replacement).toHaveBeenLastCalledWith(600);
  } finally {
    feed.cleanup();
  }
});

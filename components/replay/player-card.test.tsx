import { Box } from '@chakra-ui/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Replay, ReplayPoint } from '@gravllift/halo-film';
import { PlayerCard } from './player-card';

jest.mock('@chakra-ui/react', () => {
  const React = require('react');
  const component = ({
    children,
    w,
  }: {
    children?: React.ReactNode;
    w?: string;
  }) => React.createElement('div', { 'data-width': w }, children);
  return { Box: jest.fn(component), Flex: component, Text: component };
});

it('updates displayed player state while ignoring movement alone', () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const player = { actor: 0, gamertag: 'Player' };
  const status = jest.fn<
    ReturnType<Replay['status']>,
    Parameters<Replay['status']>
  >();
  const loadout = jest.fn<
    ReturnType<Replay['loadout']>,
    Parameters<Replay['loadout']>
  >();
  const replay: Replay = {
    startMs: 0,
    endMs: 10000,
    actorCount: 1,
    players: [player],
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    at: () => [],
    trail: () => [],
    scores: () => [],
    status,
    loadout,
    objectives: () => [],
    zones: () => [],
    hills: () => undefined,
    fires: () => [],
    graves: () => [],
  };
  const point: ReplayPoint = { actor: 0, slot: 1, x: 0, y: 0, z: 0, shield: 1 };
  status.mockReturnValue({
    alive: true,
    stats: { score: 0, kills: 0, deaths: 0, assists: 0 },
  });
  loadout.mockReturnValue({
    weapon: 'BR75',
    ammoKnown: true,
    mag: 20,
    grenades: [],
    atMs: 0,
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (timeMs: number, currentPoint: ReplayPoint) =>
    act(() =>
      root.render(
        <PlayerCard
          player={player}
          replay={replay}
          point={currentPoint}
          timeMs={timeMs}
        />,
      ),
    );

  render(0, point);
  expect(container.textContent).toContain('BR75');
  expect(container.textContent).toContain('20 / 0');
  const boxRenders = jest.mocked(Box).mock.calls.length;
  render(1, { ...point, x: 0.5 });
  expect(jest.mocked(Box).mock.calls.length).toBe(boxRenders);

  status.mockReturnValue({
    alive: true,
    stats: { score: 100, kills: 1, deaths: 0, assists: 0 },
  });
  loadout.mockReturnValue({
    weapon: 'Sidekick',
    ammoKnown: true,
    mag: 5,
    grenades: [{ name: 'Frag', count: 2, selected: true }],
    atMs: 1,
  });
  render(2, { ...point, shield: 0.5 });
  expect(container.textContent).toContain('100');
  expect(container.textContent).toContain('Sidekick');
  expect(container.textContent).toContain('5 / 0');
  expect(container.textContent).toContain('Frag ×2');
  expect(container.querySelector('[data-width="50%"]')).not.toBeNull();

  status.mockReturnValue({ alive: false, respawnInMs: 3200 });
  render(3, point);
  expect(container.textContent).toContain('RESPAWNING IN3');
  status.mockReturnValue({ alive: false, respawnInMs: 1900 });
  render(4, point);
  expect(container.textContent).toContain('RESPAWNING IN2');
  act(() => root.unmount());
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

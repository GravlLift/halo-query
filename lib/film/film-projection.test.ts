import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import { projectInventories } from './film-inventory';
import { createReplay } from './timeline/replay';
import { projectOddballTimeline } from './film-objectives';
import type { FilmData } from '@gravllift/halo-helpers/film-data';

const life = {
  playerId: 7,
  slot: 512,
  startMs: 1000,
  endMs: 10000,
  sampleCount: 0,
};
const positions: LinkedFilmPositions = {
  layout: { gateBits: 0, axisBits: [1, 1, 1] },
  flipRates: [],
  tracks: [],
  actors: [{ actor: 0, lives: [life] }],
};
const bandit = 0x6acdc44d;
const sidekick = 0xf408190f;

describe('canonical inventory projection', () => {
  it('does not keep a stale duplicate when a pickup moves a known weapon to another slot', () => {
    const inventories = projectInventories(
      {
        events: [
          { tick: 90, event: { Shot: { player: 7, weapon: bandit } } },
          {
            tick: 120,
            event: { Pickup: { player: 7, item: bandit, slot: 1 } },
          },
        ],
        states: [
          {
            playerId: 7,
            state: { ammo: [{ tick: 30, slot: 0, loaded: 15, reserve: 45 }] },
          },
        ],
      },
      [life],
    );
    const loadout = createReplay(
      positions,
      undefined,
      undefined,
      inventories,
    ).loadout(0, 2500);
    assert.equal(loadout?.weapon, 'Bandit Evo');
    assert.equal(loadout?.holstered, undefined);
  });

  it('seeds pre-spawn inventory state and updates weapon slots without leaking equipment across lives', () => {
    const inventories = projectInventories(
      {
        events: [
          { tick: 90, event: { Shot: { player: 7, weapon: bandit } } },
          {
            tick: 120,
            event: { Pickup: { player: 7, item: sidekick, slot: 1 } },
          },
          {
            tick: 130,
            event: { Pickup: { player: 7, item: 0x7ca85adc, slot: 2 } },
          },
          {
            tick: 180,
            event: {
              Action: { player: 7, kind: { WeaponSwitch: { slot: 0 } } },
            },
          },
        ],
        states: [
          {
            playerId: 7,
            state: {
              ammo: [
                { tick: 30, slot: 0, loaded: 15, reserve: 45 },
                { tick: 120, slot: 1, loaded: 12, reserve: 36 },
              ],
              grenades: [{ tick: 30, counts: [2, 0, 0, 0] }],
            },
          },
        ],
      },
      [life, { ...life, slot: 513, startMs: 20000, endMs: 30000 }],
    );
    const replay = createReplay(positions, undefined, undefined, inventories);
    assert.equal(replay.loadout(0, 1000)?.mag, 15);
    assert.equal(replay.loadout(0, 1000)?.weapon, undefined);
    assert.equal(replay.loadout(0, 1000)?.grenades[0].count, 2);
    assert.equal(replay.loadout(0, 1600)?.weapon, 'Bandit Evo');
    assert.equal(replay.loadout(0, 2200)?.weapon, 'Mk51 Sidekick');
    assert.equal(replay.loadout(0, 2200)?.mag, 12);
    assert.equal(replay.loadout(0, 2200)?.holstered?.weapon, 'Bandit Evo');
    assert.equal(replay.loadout(0, 2200)?.equipment, 'Repulsor');
    assert.equal(replay.loadout(0, 3200)?.weapon, 'Bandit Evo');
    assert.equal(
      inventories.find((snapshot) => snapshot.slot === 513)?.equipment,
      undefined,
    );
  });

  it('retains energy charge and grenade-only inventories without inventing ammunition', () => {
    const inventories = projectInventories(
      {
        events: [],
        states: [
          {
            playerId: 7,
            state: {
              energy: [{ tick: 30, slot: 0, percent: 75 }],
              grenades: [{ tick: 30, counts: [0, 1, 0, 0] }],
            },
          },
        ],
      },
      [life],
    );
    const replay = createReplay(positions, undefined, undefined, inventories);
    assert.equal(replay.loadout(0, 1500)?.chargeLeft, 0.75);
    assert.equal(replay.loadout(0, 1500)?.grenades[0].name, 'Plasma');
    const grenades = projectInventories(
      {
        events: [],
        states: [
          {
            playerId: 7,
            state: { grenades: [{ tick: 30, counts: [1, 0, 0, 0] }] },
          },
        ],
      },
      [life],
    );
    assert.equal(
      createReplay(positions, undefined, undefined, grenades).loadout(0, 1500)
        ?.ammoKnown,
      false,
    );
  });
});

describe('canonical oddball projection', () => {
  const players: FilmData['players'] = [7, 9].map((id) => ({
    id,
    kind: { Human: { xuid: 2533274800000000 + id, gamertag: `Player ${id}` } },
    team: id === 7 ? 0 : 1,
    present_at_start: true,
    joined: null,
    left: null,
  }));
  const ballPositions: LinkedFilmPositions = {
    layout: { gateBits: 0, axisBits: [1, 1, 1] },
    flipRates: [],
    actors: [
      {
        actor: 0,
        lives: [{ slot: 512, startMs: 0, endMs: 2000, sampleCount: 2 }],
      },
      {
        actor: 1,
        lives: [{ slot: 513, startMs: 0, endMs: 10000, sampleCount: 2 }],
      },
    ],
    tracks: [
      {
        slot: 512,
        samples: [
          { timeMs: 0, q: [0, 0, 0], normalized: [0.2, 0.3, 0] },
          { timeMs: 2000, q: [0, 0, 0], normalized: [0.4, 0.5, 0] },
        ],
      },
      {
        slot: 513,
        samples: [
          { timeMs: 0, q: [0, 0, 0], normalized: [0.7, 0.8, 0] },
          { timeMs: 10000, q: [0, 0, 0], normalized: [0.7, 0.8, 0] },
        ],
      },
    ],
  };
  const data: Pick<
    FilmData,
    | 'mode'
    | 'events'
    | 'players'
    | 'coordinates'
    | 'worldObjects'
    | 'groundWeapons'
    | 'kills'
  > = {
    mode: 'Oddball',
    players,
    coordinates: {
      source: 'LevelBox',
      scale_x: 1,
      scale_y: 1,
      offset_x: 0,
      offset_y: 0,
      spawn_fit: null,
    },
    worldObjects: [],
    groundWeapons: [
      {
        tag: 0x17592c,
        position: { x: -0.55 * 32768, y: 0.45 * 32768, z: null },
        from: 130,
        to: 180,
        taken: true,
      },
    ],
    events: [
      { tick: 0, event: { Zone: { kind: 'SkullSpawn', player: null } } },
      { tick: 60, event: { Zone: { kind: 'SkullGrab', player: 9 } } },
      { tick: 60, event: { Pickup: { player: 7, item: 0x17592c, slot: 0 } } },
      { tick: 180, event: { Pickup: { player: 9, item: 0x17592c, slot: 0 } } },
      { tick: 300, event: { Zone: { kind: 'SkullSpawn', player: null } } },
    ],
    kills: [
      {
        tick: 120,
        kill: {
          victim: 7,
          killer: 9,
          killer_damage_percent: 100,
          assistant: null,
          assistant_damage_percent: 0,
          suicide: false,
          headshot: null,
          scored: true,
          cause: null,
          weapon: null,
          position: null,
        },
      },
    ],
  };

  it('renders spawn, authoritative possession, death/drop, ground pickup and reset', () => {
    const home = [{ role: 'oddball_spawn', x: 0.25, y: 0.35 }];
    const timeline = projectOddballTimeline(data, ballPositions, home);
    assert.ok(timeline?.length);
    const replay = createReplay(
      ballPositions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline },
      10000,
    );
    assert.deepEqual(replay.objectives(500), [
      { kind: 'skull', state: 'home', team: undefined, x: 0.25, y: 0.35 },
    ]);
    assert.equal(replay.objectives(1500)[0].actor, 0);
    assert.equal(
      replay.objectives(1500)[0].x,
      replay.at(1500).find((point) => point.actor === 0)?.x,
    );
    assert.deepEqual(replay.objectives(2100)[0], {
      kind: 'skull',
      state: 'dropped',
      team: undefined,
      x: 0.4,
      y: 0.5,
    });
    assert.equal(replay.objectives(2300)[0].state, 'dropped');
    assert.equal(replay.objectives(2300)[0].x, 0.45);
    assert.equal(replay.objectives(4000)[0].actor, 1);
    assert.equal(replay.objectives(5500)[0].state, 'home');
    const transferred = createReplay(
      ballPositions,
      undefined,
      undefined,
      [],
      [],
      [],
      structuredClone({ timeline }),
      10000,
    );
    assert.deepEqual(transferred.objectives(4000), replay.objectives(4000));
  });

  it('does not use future world positions or let an old ground record erase a new carrier', () => {
    const timeline = projectOddballTimeline(
      {
        ...data,
        groundWeapons: [
          { tag: 0x17592c, position: { x: 0, y: 0 }, from: 30, to: 90 },
        ],
        worldObjects: [{ tag: 0x17592c, position: { x: 0, y: 0 }, from: 900 }],
      },
      ballPositions,
      [],
    );
    const replay = createReplay(
      ballPositions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline },
      10000,
    );
    assert.equal(replay.objectives(250).length, 0);
    assert.equal(replay.objectives(1700)[0].actor, 0);
    assert.equal(replay.objectives(3000)[0].actor, 1);
  });

  it('leaves other game modes on their existing objective path', () => {
    assert.equal(
      projectOddballTimeline(
        { ...data, mode: 'Slayer', events: [] },
        ballPositions,
        [],
      ),
      undefined,
    );
  });

  it('does not replace a living carrier with a pickup attributed to a dead player', () => {
    const timeline = projectOddballTimeline(
      {
        ...data,
        events: [
          ...data.events,
          { tick: 150, event: { Zone: { kind: 'SkullGrab', player: 9 } } },
          {
            tick: 150,
            event: { Pickup: { player: 7, item: 0x17592c, slot: 0 } },
          },
        ],
      },
      ballPositions,
      [],
    );
    const replay = createReplay(
      ballPositions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline },
      10000,
    );
    assert.equal(replay.objectives(2700)[0].actor, 1);
  });
});

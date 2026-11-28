import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import { projectInventories } from './film-inventory';
import { createReplay } from './timeline/replay';
import {
  projectObjectiveFeed,
  projectOddballTimeline,
} from './film-objectives';
import type { FilmData } from '@gravllift/halo-helpers/film-data';

it('projects recorded objective actions and team captures in chronological order', () => {
  const entries = projectObjectiveFeed(
    {
      players: [
        {
          id: 7,
          kind: { human: { xuid: '123', gamertag: 'Spartan' } },
          team: 1,
          present_at_start: true,
        },
        {
          id: 9,
          kind: { human: { xuid: '456', gamertag: 'Carrier' } },
          team: 0,
          present_at_start: true,
        },
      ],
      events: [
        { tick: 180, event: { type: 'flag', kind: 'capture', player: 7 } },
        { tick: 60, event: { type: 'zone', kind: 'skull_grab', player: 7 } },
        { tick: 60, event: { type: 'pickup', player: 9, item: '0017592c' } },
        { tick: 240, event: { type: 'zone', kind: 'hill_won', team: 1 } },
        { tick: 270, event: { type: 'shot', player: 7 } },
      ],
    },
    [{ timeMs: 2000, team: 0 }],
  );
  assert.deepEqual(
    entries.map(({ timeMs, action }) => [timeMs, action]),
    [
      [1000, 'grabbed the oddball'],
      [2000, 'captured a zone'],
      [3000, 'captured the flag'],
      [4000, 'captured the hill'],
    ],
  );
  assert.equal(entries[0].player?.gamertag, 'Carrier');
  assert.equal(entries[1].team, 0);
  assert.equal(entries[2].player?.team, 1);
});

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
const tagId = (value: number) => value.toString(16).padStart(8, '0');

describe('canonical inventory projection', () => {
  it('does not keep a stale duplicate when a pickup moves a known weapon to another slot', () => {
    const inventories = projectInventories(
      {
        events: [
          {
            tick: 90,
            event: { type: 'shot', player: 7, weapon: tagId(bandit) },
          },
          {
            tick: 120,
            event: { type: 'pickup', player: 7, item: tagId(bandit), slot: 1 },
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
          {
            tick: 90,
            event: { type: 'shot', player: 7, weapon: tagId(bandit) },
          },
          {
            tick: 120,
            event: {
              type: 'pickup',
              player: 7,
              item: tagId(sidekick),
              slot: 1,
            },
          },
          {
            tick: 130,
            event: {
              type: 'pickup',
              player: 7,
              item: tagId(0x7ca85adc),
              slot: 2,
            },
          },
          {
            tick: 180,
            event: {
              type: 'action',
              player: 7,
              kind: { weapon_switch: { slot: 0 } },
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
    kind: {
      human: { xuid: String(2533274800000000 + id), gamertag: `Player ${id}` },
    },
    team: id === 7 ? 0 : 1,
    present_at_start: true,
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
    mode: 'oddball',
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
        tag: tagId(0x17592c),
        position: { x: -0.55 * 32768, y: 0.45 * 32768, z: null },
        from: 130,
        removed: 180,
        taken: true,
      },
    ],
    events: [
      { tick: 0, event: { type: 'zone', kind: 'skull_spawn', player: null } },
      { tick: 60, event: { type: 'zone', kind: 'skull_grab', player: 9 } },
      {
        tick: 60,
        event: { type: 'pickup', player: 7, item: tagId(0x17592c), slot: 0 },
      },
      {
        tick: 180,
        event: { type: 'pickup', player: 9, item: tagId(0x17592c), slot: 0 },
      },
      { tick: 300, event: { type: 'zone', kind: 'skull_spawn', player: null } },
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
          {
            tag: tagId(0x17592c),
            position: { x: 0, y: 0 },
            from: 30,
            removed: 90,
          },
        ],
        worldObjects: [
          { tag: tagId(0x17592c), position: { x: 0, y: 0 }, from: 900 },
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
    assert.equal(replay.objectives(250).length, 0);
    assert.equal(replay.objectives(1700)[0].actor, 0);
    assert.equal(replay.objectives(3000)[0].actor, 1);
  });

  it('leaves other game modes on their existing objective path', () => {
    assert.equal(
      projectOddballTimeline(
        { ...data, mode: 'slayer', events: [] },
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
          { tick: 150, event: { type: 'zone', kind: 'skull_grab', player: 9 } },
          {
            tick: 150,
            event: {
              type: 'pickup',
              player: 7,
              item: tagId(0x17592c),
              slot: 0,
            },
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
    const feed = projectObjectiveFeed(
      {
        ...data,
        events: [
          { tick: 150, event: { type: 'zone', kind: 'skull_grab', player: 9 } },
          {
            tick: 150,
            event: { type: 'pickup', player: 7, item: tagId(0x17592c) },
          },
        ],
      },
      [],
      ballPositions,
    );
    assert.equal(feed.length, 1);
    const playerKind = data.players[1].kind;
    assert.ok('human' in playerKind);
    assert.equal(feed[0].player?.xuid, String(playerKind.human.xuid));
  });

  it('uses possession changes to avoid repeating an uninterrupted oddball grab', () => {
    const feed = projectObjectiveFeed(data, [], ballPositions, [
      { kind: 'skull', state: 'carried', timeMs: 1000, actor: 1 },
      { kind: 'skull', state: 'carried', timeMs: 1100, actor: 1 },
      { kind: 'skull', state: 'dropped', timeMs: 1200, x: 0, y: 0 },
      { kind: 'skull', state: 'carried', timeMs: 1300, actor: 1 },
    ]);
    assert.deepEqual(
      feed.map((entry) => entry.timeMs),
      [1000, 1300],
    );
  });
});

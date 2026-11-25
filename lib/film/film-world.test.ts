import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FilmData } from '@gravllift/halo-helpers/film-data';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import { projectFlagTimeline } from './film-flags';
import { createReplay } from './timeline/replay';
import {
  projectWorldObjects,
  worldObjectsAt,
  projectWorldZones,
  worldZonesAt,
  worldHillsAt,
} from './film-world';

const positions: LinkedFilmPositions = {
  layout: { gateBits: 0, axisBits: [1, 1, 1] },
  flipRates: [],
  actors: [0, 1].map((actor) => ({
    actor,
    team: actor,
    lives: [{ slot: 512 + actor, startMs: 0, endMs: 10000, sampleCount: 2 }],
  })),
  tracks: [0, 1].map((actor) => ({
    slot: 512 + actor,
    samples: [0, 10000].map(
      (timeMs) =>
        ({
          timeMs,
          q: [0, 0, 0],
          normalized: [actor === 0 ? 0.8 : 0.2, 0.5, 0],
        }) satisfies LinkedFilmPositions['tracks'][number]['samples'][number],
    ),
  })),
};
const homes = [
  { role: 'flag_spawn', team: 0, x: 0.2, y: 0.5 },
  { role: 'flag_spawn', team: 1, x: 0.8, y: 0.5 },
];
const tagId = (value: number) => value.toString(16).padStart(8, '0');
const base: Parameters<typeof projectFlagTimeline>[0] = {
  mode: 'capture_the_flag',
  coordinates: null,
  groundWeapons: [],
  kills: [],
  events: [],
  players: [7, 9].map((id, index) => ({
    id,
    kind: {
      human: { xuid: String(2533274800000000 + id), gamertag: `Player ${id}` },
    },
    team: index,
    present_at_start: true,
  })),
};

describe('canonical CTF flags', () => {
  it('returns an abandoned flag home without letting a stale removal erase a new carrier', () => {
    const data: typeof base = {
      ...base,
      coordinates: {
        source: 'LevelBox',
        scale_x: 1,
        scale_y: 1,
        offset_x: 0,
        offset_y: 0,
        spawn_fit: null,
      },
      events: [{ tick: 60, event: { type: 'flag', kind: 'grab', player: 7 } }],
      groundWeapons: [
        {
          tag: tagId(0x2a392328),
          position: { x: -0.5 * 32768, y: 0.8 * 32768 },
          from: 90,
          removed: 180,
          taken: false,
        },
      ],
    };
    const timeline = projectFlagTimeline(data, positions, [
      ...homes,
      { role: 'flag_spawn', team: -1, x: 0.5, y: 0.5 },
    ]);
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline },
      10000,
    );
    assert.equal(
      replay.objectives(2000).find((flag) => flag.team === 1)?.state,
      'dropped',
    );
    assert.equal(
      replay.objectives(3500).find((flag) => flag.team === 1)?.state,
      'home',
    );
    const carried = projectFlagTimeline(
      {
        ...data,
        events: [
          ...data.events,
          {
            tick: 120,
            event: {
              type: 'pickup',
              player: 7,
              item: tagId(0x2a392328),
              slot: 0,
            },
          },
        ],
      },
      positions,
      homes,
    );
    const next = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline: carried },
      10000,
    );
    assert.equal(
      next.objectives(3500).find((flag) => flag.team === 1)?.actor,
      0,
    );
    assert.equal(next.objectives(3500).length, 2);
  });

  it('renders both homes and independent opposing carriers, then capture and return', () => {
    const data: typeof base = {
      ...base,
      events: [
        {
          tick: 60,
          event: { type: 'flag', kind: 'grab', player: 7, position: null },
        },
        {
          tick: 90,
          event: {
            type: 'pickup',
            player: 9,
            item: tagId(0x2a392328),
            slot: 0,
          },
        },
        {
          tick: 180,
          event: { type: 'flag', kind: 'capture', player: 7, position: null },
        },
        {
          tick: 240,
          event: { type: 'flag', kind: 'return', player: 7, position: null },
        },
      ],
    };
    const timeline = projectFlagTimeline(data, positions, homes);
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline },
      10000,
    );
    assert.equal(replay.objectives(500).length, 2);
    assert.equal(
      replay.objectives(2000).find((flag) => flag.team === 1)?.actor,
      0,
    );
    assert.equal(
      replay.objectives(2000).find((flag) => flag.team === 0)?.actor,
      1,
    );
    assert.equal(
      replay.objectives(3500).find((flag) => flag.team === 1)?.state,
      'home',
    );
    assert.equal(
      replay.objectives(4500).find((flag) => flag.team === 0)?.state,
      'home',
    );
    assert.equal(replay.objectives(4500).length, 2);
    const copy = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      structuredClone({ timeline }),
      10000,
    );
    assert.deepEqual(copy.objectives(2000), replay.objectives(2000));
  });

  it('drops the carried flag on the carrier death without moving the other flag', () => {
    const kill: FilmData['kills'][number] = {
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
    };
    const timeline = projectFlagTimeline(
      {
        ...base,
        events: [
          { tick: 60, event: { type: 'flag', kind: 'steal', player: 7 } },
        ],
        kills: [kill],
      },
      positions,
      homes,
    );
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      { timeline },
      10000,
    );
    assert.equal(
      replay.objectives(2500).find((flag) => flag.team === 1)?.state,
      'dropped',
    );
    assert.equal(
      replay.objectives(2500).find((flag) => flag.team === 0)?.state,
      'home',
    );
  });
});

describe('canonical world objects', () => {
  it('uses explicit zone ownership, progress, contested state and occupants', () => {
    const data = projectWorldZones(
      {
        coordinates: {
          source: 'LevelBox',
          scale_x: 1,
          scale_y: 1,
          offset_x: 0,
          offset_y: 0,
          spawn_fit: null,
        },
        players: base.players,
        hillScore: null,
        events: [],
        zones: [
          {
            entity: 20,
            position: { x: -0.5 * 32768, y: 0.4 * 32768 },
            letter: 'A',
            shape: { area: { cylinder: { radius: 10 } }, team: -1 },
            states: [
              {
                tick: 30,
                owner: 0,
                capturing: 1,
                progress: 65,
                contested: true,
                inside: [7],
              },
            ],
          },
        ],
      },
      positions,
    );
    assert.equal(data.zones[0].objective.label, 'A');
    assert.equal(data.zones[0].objective.x, 0.4);
    const zone = worldZonesAt(data, 1000)[0];
    assert.equal(zone.owner, 0);
    assert.equal(zone.progress, 0.65);
    assert.equal(zone.contested, true);
    assert.deepEqual(zone.inside, [0]);
    assert.equal(zone.capturingTeam, 1);
  });

  it('projects rectangular hills as polygons instead of circular radii', () => {
    const data = projectWorldZones(
      {
        coordinates: {
          source: 'LevelBox',
          scale_x: 1,
          scale_y: 1,
          offset_x: 0,
          offset_y: 0,
          spawn_fit: null,
        },
        players: base.players,
        hillScore: null,
        events: [],
        zones: [
          {
            entity: 20,
            position: { x: -0.5 * 32768, y: 0.4 * 32768 },
            shape: {
              area: { box: { length: 60, width: 40 } },
              angle: 0.25,
              team: -1,
            },
            states: [],
          },
        ],
      },
      positions,
    );

    assert.equal(data.zones[0].objective.radius, undefined);
    assert.equal(data.zones[0].objective.polygon?.length, 4);
  });

  it('uses explicit hill activity and point bars rather than inferring them from occupancy', () => {
    const data = projectWorldZones(
      {
        coordinates: {
          source: 'LevelBox',
          scale_x: 1,
          scale_y: 1,
          offset_x: 0,
          offset_y: 0,
          spawn_fit: null,
        },
        players: base.players,
        hillScore: {
          points_to_win: 40,
          points: [
            { tick: 60, team: 0, points: 20 },
            { tick: 90, team: 1, points: 10 },
          ],
        },
        zones: [{ entity: 20, position: { x: -100, y: 100 }, states: [] }],
        events: [
          {
            tick: 30,
            event: { type: 'zone', kind: 'hill_controlled', zone: 0, team: 0 },
          },
          {
            tick: 180,
            event: { type: 'zone', kind: 'hill_won', zone: 0, team: 0 },
          },
        ],
      },
      positions,
    );
    assert.equal(worldHillsAt(data, 2000)?.activeHill, 0);
    assert.equal(worldHillsAt(data, 2000)?.controllingTeam, 0);
    assert.deepEqual(worldHillsAt(data, 2000)?.progress, [
      { team: 0, progress: 0.5 },
      { team: 1, progress: 0.25 },
    ]);
    assert.equal(worldHillsAt(data, 4000)?.activeHill, undefined);
    assert.deepEqual(
      worldHillsAt(structuredClone(data), 2000),
      worldHillsAt(data, 2000),
    );
  });

  it('projects timed weapons, equipment, grenades and unknown props without duplicating flags', () => {
    const point = { x: -0.4 * 32768, y: 0.3 * 32768, z: null };
    const tracks = projectWorldObjects(
      {
        players: base.players,
        coordinates: {
          source: 'LevelBox',
          scale_x: 1,
          scale_y: 1,
          offset_x: 0,
          offset_y: 0,
          spawn_fit: null,
        },
        worldObjects: [
          {
            tag: tagId(0x6acdc44d),
            position: point,
            from: 0,
            removed: 120,
            entity_type: 42,
          },
          {
            tag: tagId(0xe7be9f5c),
            position: point,
            from: 0,
            entity_type: 43,
          },
          {
            tag: tagId(0xcaaadcb0),
            position: point,
            from: 0,
            entity_type: 43,
          },
          { tag: tagId(123), position: point, from: 0, entity_type: 37 },
          { tag: tagId(124), position: point, from: 0, entity_type: 43 },
          {
            tag: tagId(0x2a392328),
            position: point,
            from: 0,
            entity_type: 42,
          },
          {
            tag: tagId(0x17592c),
            position: point,
            from: 0,
            entity_type: 42,
          },
        ],
        groundWeapons: [
          { tag: tagId(0x6acdc44d), position: point, from: 30, removed: 60 },
        ],
        vehicles: [],
        rides: [],
      },
      positions,
    );
    const visible = worldObjectsAt(tracks, 750);
    assert.equal(
      visible.filter((object) => object.tag === 0x6acdc44d).length,
      1,
    );
    assert.equal(
      visible.find((object) => object.tag === 0x6acdc44d)?.dropped,
      true,
    );
    assert.equal(
      visible.find((object) => object.tag === 0xe7be9f5c)?.label,
      'Active Camo',
    );
    assert.equal(
      visible.find((object) => object.tag === 0xcaaadcb0)?.kind,
      'grenade',
    );
    assert.equal(visible.find((object) => object.tag === 123)?.kind, 'object');
    assert.equal(visible.find((object) => object.tag === 124)?.kind, 'object');
    assert.equal(visible.find((object) => object.tag === 0x6acdc44d)?.x, 0.3);
    assert.ok(
      !worldObjectsAt(tracks, 1250).some((object) =>
        object.id.startsWith('ground:'),
      ),
    );
    assert.ok(
      !visible.some(
        (object) => object.tag === 0x2a392328 || object.tag === 0x17592c,
      ),
    );
  });

  it('interpolates vehicle tracks and associates occupants without duplicate static vehicles', () => {
    const tracks = projectWorldObjects(
      {
        players: base.players,
        coordinates: {
          source: 'LevelBox',
          scale_x: 1,
          scale_y: 1,
          offset_x: 0,
          offset_y: 0,
          spawn_fit: null,
        },
        worldObjects: [{ tag: tagId(1234), position: { x: 0, y: 0 }, from: 0 }],
        groundWeapons: [],
        vehicles: [
          {
            tag: tagId(1234),
            entity: 300,
            track: [
              { tick: 0, position: { x: 0, y: 0 } },
              { tick: 60, position: { x: -32768, y: 32768 } },
            ],
          },
        ],
        rides: [{ player: 7, vehicle: 0, from: 0, to: 60, seat: 0 }],
      },
      positions,
    );
    assert.equal(tracks.length, 1);
    const vehicle = worldObjectsAt(tracks, 500)[0];
    assert.equal(vehicle.x, 0.5);
    assert.equal(vehicle.y, 0.5);
    assert.deepEqual(vehicle.riders, [0]);
    assert.equal(vehicle.team, 0);
    assert.equal(worldObjectsAt(tracks, 1100).length, 0);
    assert.deepEqual(worldObjectsAt(structuredClone(tracks), 500), [vehicle]);
  });
});

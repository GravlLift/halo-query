import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { FilmData } from '@gravllift/halo-helpers/film-data';
import { GameVariantCategory } from '@gravllift/halo-infinite-maps';
import {
  createMatchReplay,
  decodeFilmData,
  type FilmMatchStats,
  type FilmManifest,
} from './load-film';
import { projectFilmData } from './film-data';

const match: FilmMatchStats = {
  MatchInfo: { MapVariant: { AssetId: '' }, GameVariantCategory: -1 },
  Players: [],
  Teams: [],
};

function sampleData(): FilmData {
  return {
    header: {
      build: null,
      branch: null,
      started_at: null,
      map_asset_id: null,
      map_version_id: null,
      level: null,
    },
    clock: {
      frameCount: 2,
      frameTicks: [0, 60],
      end: 60,
      ticksPerFrame: 1,
      highlightZero: 0,
      hitches: [],
    },
    players: [
      {
        id: 7,
        kind: { human: { xuid: '2533274800000000', gamertag: 'Spartan' } },
        team: 1,
        present_at_start: true,
      },
    ],
    variant: null,
    mode: 'other',
    level: null,
    coordinates: null,
    lives: [
      {
        player: 7,
        entity: 512,
        died: false,
        death: null,
        samples: [0, 60].map((tick) => ({
          tick,
          raw: [8192, 16384],
          position: null,
          yaw: Math.PI / 2,
          speed: null,
          health: 1,
          shield: 0.5,
          in_vehicle: false,
          vehicle: null,
        })),
      },
    ],
    vehicles: [],
    rides: [],
    worldObjects: [],
    groundWeapons: [],
    grenadeFlights: [],
    zones: [],
    hillScore: null,
    events: [],
    kills: [],
    highlights: [],
    medals: [],
    scoreboard: { changes: [], match_clock: [], engine: [] },
    states: [],
  };
}

describe('FilmData replay boundary', () => {
  it('projects WASM-shaped lives without native records', async () => {
    const data = sampleData();
    const projected = projectFilmData(data);
    assert.equal(projected.positions?.actors[0].xuid, '2533274800000000');
    assert.equal(projected.positions?.tracks[0].samples[0].aimYawDeg, 0);
    const replay = createMatchReplay(
      await decodeFilmData(data, match, undefined, undefined, false),
    );
    assert.equal(replay.endMs, 1000);
    assert.equal(replay.players[0].team, 1);
    const point = replay.at(500)[0];
    assert.equal(point.x, 0.25);
    assert.equal(point.y, 0.5);
    assert.equal(point.shield, 0.5);
  });

  it('survives JSON serialization without native decoder records', async () => {
    const data: FilmData = JSON.parse(JSON.stringify(sampleData()));
    const replay = createMatchReplay(
      await decodeFilmData(data, match, undefined, undefined, false),
    );
    assert.equal(replay.at(500).length, 1);
  });

  it('uses explicit scoreboard owners even with only one change', async () => {
    const data = sampleData();
    data.scoreboard.changes = [
      { tick: 30, owner: { team: 4 }, slot: 0, value: 3, round: 0 },
      { tick: 30, owner: { player: 7 }, slot: 4, value: 2, round: 0 },
    ];
    const replay = createMatchReplay(
      await decodeFilmData(data, match, undefined, undefined, false),
    );
    assert.equal(
      replay.scores(750).find((score) => score.team === 4)?.score,
      3,
    );
    assert.equal(replay.status(0, 750)?.stats?.kills, 2);
  });

  it('builds the event feed from native kill records without highlight ticks', async () => {
    const data = sampleData();
    data.players.push({
      id: 9,
      kind: { human: { xuid: '2533274800000009', gamertag: 'Killer' } },
      team: 0,
      present_at_start: true,
    });
    data.kills = [
      {
        tick: 30,
        kill: {
          victim: 7,
          killer: 9,
          killer_damage_percent: 100,
          suicide: false,
        },
      },
    ];
    const replay = createMatchReplay(
      await decodeFilmData(data, match, undefined, undefined, false),
    );

    assert.equal(replay.killFeed.length, 1);
    assert.equal(replay.killFeed[0].killer?.gamertag, 'Killer');
    assert.equal(replay.killFeed[0].victim?.gamertag, 'Spartan');
  });

  it('merges objective events with kills and excludes future partial events', async () => {
    const data = sampleData();
    data.players.push({
      id: 9,
      kind: { human: { xuid: '2533274800000009', gamertag: 'Killer' } },
      team: 0,
      present_at_start: true,
    });
    data.kills = [{ tick: 30, kill: { victim: 7, killer: 9, suicide: false } }];
    data.events = [
      { tick: 15, event: { type: 'flag', kind: 'grab', player: 7 } },
      { tick: 45, event: { type: 'flag', kind: 'capture', player: 7 } },
    ];
    const replay = createMatchReplay(
      await decodeFilmData(data, match, undefined, 600, true),
    );
    assert.deepEqual(
      replay.eventFeed.map((entry) => entry.timeMs),
      [250, 500],
    );
    assert.equal(replay.killFeed.length, 1);
    assert.ok('type' in replay.eventFeed[0]);
  });

  it('uses recorded Strongholds ownership changes when capture counters are unavailable', async () => {
    const data = sampleData();
    data.coordinates = {
      source: 'LevelBox',
      scale_x: 1,
      scale_y: 1,
      offset_x: 0,
      offset_y: 0,
      spawn_fit: null,
    };
    data.zones = [
      {
        position: { x: 0, y: 0 },
        states: [
          { tick: 0, owner: -1 },
          { tick: 15, owner: 0 },
          { tick: 30, owner: 0 },
          { tick: 45, owner: 1 },
        ],
      },
    ];
    const strongholds = {
      ...match,
      MatchInfo: {
        ...match.MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerStrongholds,
      },
    };
    const replay = createMatchReplay(
      await decodeFilmData(data, strongholds, undefined, undefined, false),
    );
    assert.deepEqual(
      replay.eventFeed.map((entry) => [
        entry.timeMs,
        'team' in entry ? entry.team : undefined,
      ]),
      [
        [250, 0],
        [750, 1],
      ],
    );
  });

  it('keeps XUIDs serialized as decimal strings in highlight records', () => {
    const data = sampleData();
    data.highlights = [
      {
        tick: 30,
        xuid: '2533274800000000',
        gamertag: 'Spartan',
        kind: 'kill',
      },
    ];
    assert.equal(
      projectFilmData(data).records.highlightEvents[0].xuid,
      '2533274800000000',
    );
  });

  it('builds the event feed from highlights when their game ticks are unknown', async () => {
    const data = sampleData();
    data.players.push({
      id: 9,
      kind: { human: { xuid: '2533274800000009', gamertag: 'Killer' } },
      team: 0,
      present_at_start: true,
    });
    data.highlights = [
      {
        time_ms: 500,
        xuid: '2533274800000009',
        gamertag: 'Killer',
        kind: 'kill',
      },
      {
        time_ms: 500,
        xuid: '2533274800000000',
        gamertag: 'Spartan',
        kind: 'death',
      },
    ];
    const replay = createMatchReplay(
      await decodeFilmData(data, match, undefined, undefined, false),
    );

    assert.equal(replay.killFeed.length, 1);
    assert.equal(replay.killFeed[0].killer?.gamertag, 'Killer');
    assert.equal(replay.killFeed[0].victim?.gamertag, 'Spartan');
    assert.equal(replay.killFeed[0].timeMs, 500);
  });

  it('keeps successive lives distinct when an entity ID is reused', () => {
    const data = sampleData();
    const first = data.lives[0];
    data.lives.push({
      ...first,
      samples: first.samples.map((sample) => ({
        ...sample,
        tick: sample.tick + 120,
      })),
    });
    const positions = projectFilmData(data).positions;
    assert.equal(new Set(positions?.tracks.map((track) => track.slot)).size, 2);
    assert.equal(positions?.actors[0].lives.length, 2);
  });
});

const fixture = path.resolve(
  __dirname,
  '../../../match-downloader/films/047b96c8-9be2-4276-a190-f21fce1f2ea5',
);
const wasmPath = path.resolve(
  __dirname,
  '../../public/wasm/libfilmshell_wasm.js',
);
const wasmBytes = path.resolve(
  __dirname,
  '../../public/wasm/libfilmshell_wasm_bg.wasm',
);

describe(
  'WASM film parser',
  { skip: !existsSync(fixture) || !existsSync(wasmBytes) },
  () => {
    it('builds a replay from a real film through the FilmData adapter', async () => {
      const manifest: FilmManifest = JSON.parse(
        readFileSync(path.join(fixture, 'manifest.json'), 'utf8'),
      );
      const chunks = manifest.CustomData.Chunks.map((chunk) => ({
        index: chunk.Index,
        chunkType: chunk.ChunkType,
        bytes: Uint8Array.from(
          readFileSync(path.join(fixture, `filmChunk${chunk.Index}`)),
        ).buffer,
      }));
      const wasm = await import(pathToFileURL(wasmPath).href);
      wasm.initSync({ module: readFileSync(wasmBytes) });
      const fromWasm: FilmData = JSON.parse(wasm.parse_film(chunks));
      assert.ok(
        fromWasm.lives.length > 0,
        `WASM returned ${fromWasm.players.length} players but no lives`,
      );
      const replay = createMatchReplay(
        await decodeFilmData(fromWasm, match, undefined, undefined, false),
      );
      assert.ok(replay.players.length > 0);
      assert.ok(replay.firstSpawnMs !== undefined);
      assert.ok(replay.at(replay.firstSpawnMs).length > 0);
      assert.ok(replay.endMs > 0);
      assert.ok(
        replay.killFeed.length > 0,
        `WASM parsed ${fromWasm.kills.length} kills and ${fromWasm.highlights.length} highlights but produced no feed rows`,
      );
    });
  },
);

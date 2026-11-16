import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { FilmData } from '@gravllift/halo-film';
import type { FilmParser } from '@gravllift/halo-film';
import { parseFilm as parseWasmFilm } from '@gravllift/libfilmshell-wasm';
import { parseFilm } from '@gravllift/halo-film';
import {
  createMatchReplay,
  decodeFilmData,
  decodeReplay,
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
        kind: { Human: { xuid: 2533274800000000, gamertag: 'Spartan' } },
        team: 1,
        present_at_start: true,
        joined: null,
        left: null,
      },
    ],
    variant: null,
    mode: 'Other',
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
    scoreboard: { changes: [], clock: [], engine: [] },
    states: [],
  };
}

describe('FilmData replay boundary', () => {
  it('accepts either library as the same parser interface', () => {
    const wasm: FilmParser = { parseFilm: parseWasmFilm };
    const native: FilmParser = { parseFilm };
    assert.equal(typeof wasm.parseFilm, 'function');
    assert.equal(typeof native.parseFilm, 'function');
  });

  it('projects WASM-shaped lives without native records', async () => {
    const data = sampleData();
    const projected = projectFilmData(data);
    assert.equal(projected.positions?.actors[0].xuid, '2533274800000000');
    assert.equal(projected.positions?.tracks[0].samples[0].aimYawDeg, 0);
    const replay = createMatchReplay(await decodeFilmData(data, match));
    assert.equal(replay.endMs, 1000);
    assert.equal(replay.players[0].team, 1);
    const point = replay.at(500)[0];
    assert.equal(point.x, 0.25);
    assert.equal(point.y, 0.5);
    assert.equal(point.shield, 0.5);
  });

  it('accepts a synchronous parser through the chunk-loading boundary', async () => {
    let called = false;
    const data = await decodeReplay(
      { CustomData: { FilmMajorVersion: 41, Chunks: [] } },
      [],
      match,
      undefined,
      false,
      undefined,
      {
        parseFilm(chunks) {
          called = true;
          assert.deepEqual(chunks, []);
          return sampleData();
        },
      },
    );
    assert.equal(called, true);
    assert.equal(data.positions.actors[0].gamertag, 'Spartan');
  });

  it('survives JSON serialization without native decoder records', async () => {
    const data: FilmData = JSON.parse(JSON.stringify(sampleData()));
    const replay = createMatchReplay(await decodeFilmData(data, match));
    assert.equal(replay.at(500).length, 1);
  });

  it('uses explicit scoreboard owners even with only one change', async () => {
    const data = sampleData();
    data.scoreboard.changes = [
      { tick: 30, owner: { Team: 4 }, slot: 0, value: 3 },
      { tick: 30, owner: { Player: 7 }, slot: 4, value: 2 },
    ];
    const replay = createMatchReplay(await decodeFilmData(data, match));
    assert.equal(
      replay.scores(750).find((score) => score.team === 4)?.score,
      3,
    );
    assert.equal(replay.status(0, 750)?.stats?.kills, 2);
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
  'parser interchangeability',
  { skip: !existsSync(fixture) || !existsSync(wasmBytes) },
  () => {
    it('builds a replay from either real parser through the same FilmData adapter', async () => {
      const manifest: FilmManifest = JSON.parse(
        readFileSync(path.join(fixture, 'manifest.json'), 'utf8'),
      );
      const chunks = manifest.CustomData.Chunks.slice(0, 5).map((chunk) => ({
        index: chunk.Index,
        chunkType: chunk.ChunkType,
        bytes: Uint8Array.from(
          readFileSync(path.join(fixture, `filmChunk${chunk.Index}`)),
        ).buffer,
      }));
      const wasm = await import(pathToFileURL(wasmPath).href);
      wasm.initSync({ module: readFileSync(wasmBytes) });
      const fromWasm: FilmData = JSON.parse(wasm.parse_film(chunks));
      const fromTypescript = await parseFilm(chunks);
      for (const data of [fromTypescript, fromWasm]) {
        assert.ok(
          data.lives.length > 0,
          `${data.records ? 'TypeScript' : 'WASM'} returned ${data.players.length} players but no lives`,
        );
        const replay = createMatchReplay(await decodeFilmData(data, match));
        assert.ok(replay.players.length > 0);
        assert.ok(replay.firstSpawnMs !== undefined);
        assert.ok(replay.at(replay.firstSpawnMs).length > 0);
        assert.ok(replay.endMs > 0);
      }
    });
  },
);

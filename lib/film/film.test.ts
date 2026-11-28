import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { linkLives } from '@gravllift/halo-film-ui/film/players/link-lives';
import { createReplay } from './timeline/replay';
import { buildScoreTimeline, scoreAt } from './timeline/score';
import type {
  DecoderFilmChunkInput as FilmChunkInput,
  StatRecord,
} from '@gravllift/halo-helpers/film-types';
import {
  buildReplay,
  createMatchReplay,
  decodeReplay,
  loadFilm,
  type FilmManifest,
  type FilmMatchStats,
} from './load-film';

const progressiveSampleDir = path.join(
  __dirname,
  '../../../match-downloader/films/047b96c8-9be2-4276-a190-f21fce1f2ea5',
);
const progressiveMatch: FilmMatchStats = {
  MatchInfo: { MapVariant: { AssetId: '' }, GameVariantCategory: -1 },
  Players: [],
  Teams: [],
};

describe('progressive film loading', () => {
  it('stops before fetching chunks when canceled', async () => {
    const abort = new AbortController();
    abort.abort();
    let fetched = false;
    const film: FilmManifest = {
      CustomData: {
        FilmMajorVersion: 41,
        Chunks: [
          {
            Index: 0,
            ChunkType: 1,
            ChunkStartTimeOffsetMilliseconds: 0,
            DurationMilliseconds: 1,
            FileRelativePath: 'chunk0.dat',
          },
        ],
      },
    };
    await assert.rejects(
      loadFilm({
        film,
        match: progressiveMatch,
        signal: abort.signal,
        fetchChunk: async () => {
          fetched = true;
          return new Uint8Array();
        },
        onReplay: () => assert.fail('Canceled loads must not publish a replay'),
      }),
    );
    assert.equal(fetched, false);
  });

  it('does not report progress after a fetch is canceled', async () => {
    const abort = new AbortController();
    const film: FilmManifest = {
      CustomData: {
        FilmMajorVersion: 41,
        Chunks: [
          {
            Index: 0,
            ChunkType: 1,
            ChunkStartTimeOffsetMilliseconds: 0,
            DurationMilliseconds: 1,
            FileRelativePath: 'chunk0.dat',
          },
        ],
      },
    };
    let progress = 0;
    await assert.rejects(
      loadFilm({
        film,
        match: progressiveMatch,
        signal: abort.signal,
        fetchChunk: async () => {
          abort.abort();
          return new Uint8Array();
        },
        onProgress: () => {
          progress++;
        },
        onReplay: () => assert.fail('Canceled loads must not publish a replay'),
      }),
    );
    assert.equal(progress, 0);
  });

  it(
    'loads highlights before the first playable snapshot',
    { skip: !existsSync(progressiveSampleDir) },
    async () => {
      const manifest: FilmManifest = JSON.parse(
        readFileSync(path.join(progressiveSampleDir, 'manifest.json'), 'utf8'),
      );
      const highlights = manifest.CustomData.Chunks.find(
        (chunk) => chunk.ChunkType === 3,
      );
      assert.ok(highlights);
      const film: FilmManifest = {
        CustomData: {
          ...manifest.CustomData,
          Chunks: [...manifest.CustomData.Chunks.slice(0, 6), highlights],
        },
      };
      const match: FilmMatchStats = {
        ...progressiveMatch,
        MatchInfo: {
          ...progressiveMatch.MatchInfo,
          MapVariant: { AssetId: '2b6d2baf-7645-4e16-8a80-c7006f595812' },
        },
      };
      const fetched: number[] = [];
      const decoded: number[][] = [];
      let firstSnapshot = true;
      await loadFilm({
        film,
        match,
        fetchChunk: async (index) => {
          fetched.push(index);
          return readFileSync(
            path.join(progressiveSampleDir, `filmChunk${index}`),
          );
        },
        decode: async (film, chunks, match, onStage, partial, signal) => {
          decoded.push(chunks.map((chunk) => chunk.index));
          return decodeReplay(film, chunks, match, onStage, partial, signal);
        },
        onReplay: (replay, complete) => {
          assert.ok(replay.firstSpawnMs !== undefined);
          assert.ok(replay.at(replay.firstSpawnMs).length > 0);
          assert.equal(replay.startMs, 0);
          if (!complete)
            assert.ok(
              replay.killFeed.every((entry) => entry.timeMs <= replay.endMs),
            );
          if (firstSnapshot) {
            assert.equal(complete, false);
            assert.ok(replay.firstSpawnMs <= replay.endMs);
            assert.ok(fetched.includes(highlights.Index));
            assert.ok(fetched.length < film.CustomData.Chunks.length);
            firstSnapshot = false;
          }
        },
      });
      assert.equal(fetched[0], film.CustomData.Chunks[0].Index);
      assert.equal(fetched[1], highlights.Index);
      assert.ok(decoded.length > 0);
      assert.ok(decoded.every((indexes) => indexes.includes(highlights.Index)));
      assert.equal(
        fetched.filter((index) => index === highlights.Index).length,
        1,
      );
      assert.equal(firstSnapshot, false);
    },
  );

  it(
    'prioritizes the latest requested chunk before the missing prefix',
    { skip: !existsSync(progressiveSampleDir) },
    async () => {
      const manifest: FilmManifest = JSON.parse(
        readFileSync(path.join(progressiveSampleDir, 'manifest.json'), 'utf8'),
      );
      const film: FilmManifest = {
        CustomData: {
          ...manifest.CustomData,
          Chunks: manifest.CustomData.Chunks.slice(0, 9),
        },
      };
      const target = film.CustomData.Chunks[8];
      const targetTime =
        target.ChunkStartTimeOffsetMilliseconds + target.DurationMilliseconds;
      const revisedTarget = film.CustomData.Chunks[6];
      const revisedTime = revisedTarget.ChunkStartTimeOffsetMilliseconds + 100;
      const fetched: number[] = [];
      let priority: number | undefined;
      let initialCount = 0;
      const snapshots: number[] = [];
      await loadFilm({
        film,
        match: progressiveMatch,
        concurrency: 1,
        getPriorityTime: () => priority,
        fetchChunk: async (index) => {
          fetched.push(index);
          if (index === target.Index && priority === targetTime)
            priority = revisedTime;
          return readFileSync(
            path.join(progressiveSampleDir, `filmChunk${index}`),
          );
        },
        onReplay: (replay) => {
          snapshots.push(replay.endMs);
          if (snapshots.length === 1) {
            initialCount = fetched.length;
            priority = targetTime;
          } else {
            assert.ok(replay.endMs >= revisedTime);
            priority = undefined;
          }
        },
      });
      assert.ok(initialCount < 6);
      assert.equal(fetched[initialCount], target.Index);
      assert.equal(fetched[initialCount + 1], revisedTarget.Index);
      assert.ok(snapshots.length >= 2);
      assert.ok(snapshots[1] < targetTime);
    },
  );

  it(
    'publishes a playable prefix before downloading the whole film',
    { skip: !existsSync(progressiveSampleDir) },
    async () => {
      const manifest: FilmManifest = JSON.parse(
        readFileSync(path.join(progressiveSampleDir, 'manifest.json'), 'utf8'),
      );
      const film: FilmManifest = {
        CustomData: {
          ...manifest.CustomData,
          Chunks: manifest.CustomData.Chunks.slice(0, 5),
        },
      };
      const match: FilmMatchStats = {
        ...progressiveMatch,
        Players: [
          {
            PlayerId: 'xuid(9999999999999999)',
            LastTeamId: 1,
            gamertag: 'Late Spartan',
            PlayerTeamStats: [],
          },
        ],
      };
      const fetched: number[] = [];
      const snapshots: {
        endMs: number;
        complete: boolean;
        fetched: number;
        players: number;
        gamertags: string[];
        killCount: number;
      }[] = [];
      const replay = await loadFilm({
        film,
        match,
        fetchChunk: async (index) => {
          fetched.push(index);
          return readFileSync(
            path.join(progressiveSampleDir, `filmChunk${index}`),
          );
        },
        onReplay: (snapshot, complete) => {
          const missing = snapshot.players.filter(
            (player) => player.xuid === '9999999999999999',
          );
          assert.equal(missing.length, 1);
          assert.equal(missing[0].team, 1);
          assert.equal(missing[0].gamertag, 'Late Spartan');
          assert.ok(
            !snapshot
              .at(snapshot.endMs / 2)
              .some((point) => point.actor === missing[0].actor),
          );
          snapshots.push({
            endMs: snapshot.endMs,
            complete,
            fetched: fetched.length,
            players: snapshot.players.length,
            killCount: snapshot.killFeed.length,
            gamertags: snapshot.players.flatMap((player) =>
              player.gamertag ? [player.gamertag] : [],
            ),
          });
        },
      });
      assert.ok(
        snapshots.some(
          (snapshot) =>
            !snapshot.complete &&
            snapshot.fetched < film.CustomData.Chunks.length,
        ),
      );
      assert.ok(snapshots[0].players > 0);
      assert.ok(snapshots[0].gamertags.includes('GravlLift'));
      assert.ok(replay.killFeed.length > 0);
      const lastLoaded = film.CustomData.Chunks[snapshots[0].fetched - 1];
      assert.equal(
        snapshots[0].endMs,
        lastLoaded.ChunkStartTimeOffsetMilliseconds +
          lastLoaded.DurationMilliseconds,
      );
      assert.equal(snapshots.at(-1)?.complete, true);
      const chunks: FilmChunkInput[] = film.CustomData.Chunks.map((chunk) => ({
        fileRelativePath: chunk.FileRelativePath,
        index: chunk.Index,
        chunkType: chunk.ChunkType,
        startTimeOffsetMs: chunk.ChunkStartTimeOffsetMilliseconds,
        durationMs: chunk.DurationMilliseconds,
        data: readFileSync(
          path.join(progressiveSampleDir, `filmChunk${chunk.Index}`),
        ),
      }));
      const full = await buildReplay(film, chunks, match, () => {}, false);
      assert.equal(replay.endMs, full.endMs);
      assert.deepEqual(replay.players, full.players);
      assert.deepEqual(replay.at(10_000), full.at(10_000));
      assert.deepEqual(replay.killFeed, full.killFeed);
      const transferred = createMatchReplay(
        structuredClone(
          await decodeReplay(film, chunks, match, () => {}, false),
        ),
      );
      assert.equal(transferred.endMs, full.endMs);
      assert.deepEqual(transferred.players, full.players);
      assert.deepEqual(transferred.at(10_000), full.at(10_000));
      assert.deepEqual(transferred.killFeed, full.killFeed);
    },
  );
});

function track(slot: number, startMs: number, endMs: number) {
  const sample = (timeMs: number) => ({
    timeMs,
    q: [0, 0, 0] as [number, number, number],
    normalized: [0, 0, 0] as [number, number, number],
  });
  return { slot, samples: [sample(startMs), sample(endMs)] };
}

describe('linkLives', () => {
  it('hands each respawn to the player who died first', () => {
    const actors = linkLives([
      track(512, 0, 30_000),
      track(513, 0, 20_000),
      track(520, 30_000, 60_000), // 513 died first and respawns first
      track(521, 40_000, 70_000),
      track(900, 5_000, 6_000), // too short: noise
    ]);
    assert.equal(actors.length, 2);
    assert.deepEqual(
      actors.map((a) => a.lives.map((l) => l.slot)),
      [
        [512, 521],
        [513, 520],
      ],
    );
  });
});

describe('graves', () => {
  it('marks a death until the respawn, and ignores a survivor', () => {
    const tracks = [
      track(512, 0, 30_000), // dies at 30 s; respawns as 520
      track(520, 40_000, 100_000), // survives to the end
      track(513, 0, 100_000), // survives
    ];
    const positions = {
      tracks,
      actors: linkLives(tracks),
    } as unknown as Parameters<typeof createReplay>[0];
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      {},
      100_000,
    );
    assert.equal(replay.graves(20_000).length, 0);
    assert.equal(replay.graves(35_000).length, 1);
    assert.equal(replay.graves(45_000).length, 0);
    assert.equal(replay.graves(100_000).length, 0);
  });
});

describe('buildScoreTimeline', () => {
  const record = (timeMs: number, slot: number, a: number): StatRecord => ({
    timeMs,
    slot,
    round: 0,
    comps: new Map([[0, { a, b: 0 }]]),
  });

  it('builds cumulative team series and resolves team ids from final scores', () => {
    const playerRecords: StatRecord[] = Array.from({ length: 30 }, (_, i) => ({
      timeMs: i,
      slot: 10,
      round: 0,
      comps: new Map([[2, { a: i, b: 0 }]]),
    }));
    const timeline = buildScoreTimeline(
      [
        ...playerRecords,
        record(1000, 8, 1),
        record(2000, 8, 2),
        record(1500, 8, 0),
        record(3000, 6, 1),
      ],
      [
        { team: 0, score: 1 },
        { team: 1, score: 2 },
      ],
    );
    const [slot6, slot8] = timeline.teams;
    assert.equal(slot6.team, 0);
    assert.equal(slot8.team, 1);
    assert.equal(scoreAt(slot8, 1500), 1);
    assert.equal(scoreAt(slot8, 2500), 2);
    assert.equal(scoreAt(slot6, 2500), 0);
    assert.equal(scoreAt(slot6, 3500), 1);
  });
});

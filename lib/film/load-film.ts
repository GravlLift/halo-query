import { type FilmData } from '@gravllift/halo-film';
import { projectFilmData, projectScoreboard } from './film-data';
import {
  CHUNK_TYPE_HIGHLIGHTS,
  type FilmChunkInput,
} from '../../../../libs/halo-film/src/core/film-input';
import {
  GameVariantCategory,
  mapBackgroundFor,
  mapObjectivesFor,
  normalizedPerMeter,
} from '@gravllift/halo-infinite-maps';
import type {
  MapBackground,
  MapObjective,
} from '@gravllift/halo-infinite-maps';
import { buildPlayerStats } from './timeline/player-stats';
import type { ProjectileFlight } from '../../../../libs/halo-film/src/decoders/projectiles';
import { createReplay } from './timeline/replay';
import { buildKillFeed, type KillFeedEntry } from './timeline/kill-feed';
import { extractHillControl, type HillInput } from './timeline/hill-state';
import {
  extractZoneCaptureSlots,
  extractZoneSecureSlots,
  type ZoneCapture,
  type ZoneShape,
} from './timeline/zone-state';
import type { ObjectiveCarries, Replay } from './timeline/replay';
import { buildScoreTimeline } from './timeline/score';
import { buildFlagObjects, buildSkullObject } from './timeline/flag-objects';
import { parseFilm, parseFilmWithTeams } from '@gravllift/libfilmshell-wasm';
import { projectOddballTimeline } from './film-objectives';
import { projectFlagTimeline } from './film-flags';
import {
  projectWorldObjects,
  worldObjectsAt,
  projectWorldZones,
  worldZonesAt,
  worldHillsAt,
  type ReplayWorldObject,
} from './film-world';

const DEFAULT_CONCURRENCY = 6;
/** How near a biped must be to an objective to pick it up. */
const CARRY_REACH_M = 4;

/** The `spectate` API response (`HaloInfinitClient.spectateMatch`). */
export interface FilmManifest {
  CustomData: {
    Chunks: {
      FileRelativePath: string;
      Index: number;
      ChunkStartTimeOffsetMilliseconds: number;
      DurationMilliseconds: number;
      ChunkType: number;
    }[];
    FilmMajorVersion: number;
  };
}

/** The match stats API response, or anything shaped like it (e.g. a match history entry). */
export interface FilmMatchStats {
  MatchInfo: {
    MapVariant: { AssetId: string };
    GameVariantCategory: number;
  };
  Players: {
    PlayerId: string;
    LastTeamId: number;
    gamertag?: string;
    PlayerTeamStats: {
      Stats: {
        CoreStats: {
          PersonalScore: number;
          Kills: number;
          Deaths: number;
          Assists: number;
        };
      };
    }[];
  }[];
  Teams: { TeamId: number; Stats: { CoreStats: { Score: number } } }[];
}

export interface ReplayProjectile {
  flight: ProjectileFlight;
  /** Actor that threw it, when the film names one. */
  actor?: number;
  /** A sphere left where it landed, e.g. a shroud screen. Radius is in film-normalized units. */
  lingering?: { untilMs: number; radius: number };
}

/** Shroud screens last this long after landing. */
const SHROUD_DURATION_MS = 7000;
/** Estimated from a screenshot of a placement; not read from game data. */
const SHROUD_RADIUS_M = 3.5;

/** A match replay: the film's timeline plus the static map information around it. */
export interface MatchReplay extends Replay {
  worldObjects(timeMs: number): ReplayWorldObject[];
  /** Time the first group of actors has spawned, if positions are available. */
  firstSpawnMs?: number;
  projectiles: ReplayProjectile[];
  killFeed: KillFeedEntry[];
  map: {
    /** Zones and spawns of the game mode, in film coordinates. */
    objectives: MapObjective[];
    /** Top-down image of the map, when one has been calibrated. */
    background?: MapBackground;
  };
}

const xuidOf = (playerId: string) => /\d+/.exec(playerId)?.[0];

/** Number of `stage()` calls in `buildReplay`. */
const BUILD_STAGES = 7;
const SPAWN_WAVE_MS = 2000;

/** Lets the browser paint before the next synchronous stretch of parsing. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

/** Decodes the data needed to construct a replay. */
export async function decodeReplay(
  film: FilmManifest,
  chunks: readonly FilmChunkInput[],
  match: FilmMatchStats,
  onStage: ((stage: string) => void) | undefined,
  partial: boolean,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  onStage?.('Parsing film...');
  const parserChunks = chunks.map((chunk) => ({
    index: chunk.index,
    chunkType: chunk.chunkType,
    bytes: Uint8Array.from(chunk.data).buffer,
    fileRelativePath: chunk.fileRelativePath,
  }));
  const data =
    match.MatchInfo.GameVariantCategory ===
    GameVariantCategory.MultiplayerKingOfTheHill
      ? await parseFilmWithTeams(
          parserChunks,
          match.Players.flatMap((player) => {
            const xuid = xuidOf(player.PlayerId);
            const team = player.LastTeamId;
            return xuid && (team === 0 || team === 1) ? [{ xuid, team }] : [];
          }),
        )
      : await parseFilm(parserChunks);
  signal?.throwIfAborted();
  const endMs = partial
    ? chunks
        .filter((chunk) => chunk.chunkType === 2)
        .reduce(
          (end, chunk) =>
            Math.max(end, chunk.startTimeOffsetMs + chunk.durationMs),
          0,
        )
    : film.CustomData.Chunks.filter((chunk) => chunk.ChunkType === 2).reduce(
        (end, chunk) =>
          Math.max(
            end,
            chunk.ChunkStartTimeOffsetMilliseconds + chunk.DurationMilliseconds,
          ),
        0,
      );
  return decodeFilmData(data, match, onStage, endMs, partial, signal);
}

export async function decodeFilmData(
  data: FilmData,
  match: FilmMatchStats,
  onStage: ((stage: string) => void) | undefined,
  endMs: number = (data.clock.end * 1000) / 60,
  partial: boolean,
  signal?: AbortSignal,
) {
  let stageNumber = 0;
  const stage = async (name: string) => {
    signal?.throwIfAborted();
    stageNumber += 1;
    if (!onStage) return;
    onStage(`${name} (step ${stageNumber}/${BUILD_STAGES})`);
    await yieldToUi();
  };
  const { MapVariant, GameVariantCategory: category } = match.MatchInfo;
  const mapId = MapVariant.AssetId;
  const mapName =
    'PublicName' in MapVariant && typeof MapVariant.PublicName === 'string'
      ? MapVariant.PublicName
      : (data.level?.name ?? '');
  const objectives = mapObjectivesFor(mapId, category);
  const players = match.Players.flatMap((p) => {
    const xuid = xuidOf(p.PlayerId);
    return xuid ? [{ xuid, team: p.LastTeamId, gamertag: p.gamertag }] : [];
  });

  await stage('Decoding player positions...');
  const { positions, records } = projectFilmData(data);
  const { highlightEvents } = records;
  if (
    !positions ||
    positions.tracks.length === 0 ||
    positions.actors.length === 0
  )
    throw new Error('No player positions found in film');

  for (const actor of positions.actors) {
    const player = players.find((player) => player.xuid === actor.xuid);
    if (player) {
      actor.team = player.team;
      actor.gamertag = player.gamertag ?? actor.gamertag;
    }
  }
  const worldZones = projectWorldZones(data, positions);
  if (worldZones.zones.length) {
    for (let index = objectives.length - 1; index >= 0; index--) {
      if (
        ['strongholds_zone', 'hill', 'extraction_zone'].includes(
          objectives[index].role,
        )
      )
        objectives.splice(index, 1);
    }
    objectives.push(...worldZones.zones.map((zone) => zone.objective));
  }
  if (positions.actors.some((actor) => actor.xuid)) {
    const knownXuids = new Set(positions.actors.map((actor) => actor.xuid));
    for (const player of players) {
      if (knownXuids.has(player.xuid)) continue;
      positions.actors.push({
        actor: positions.actors.length,
        xuid: player.xuid,
        gamertag:
          player.gamertag ??
          records.roster.find((entry) => entry.xuid === player.xuid)
            ?.gamertag ??
          player.xuid,
        team: player.team,
        lives: [],
      });
      knownXuids.add(player.xuid);
    }
  }

  await stage('Reading scores and stats...');
  const statRecords = records.statRecords.map((record) => ({
    ...record,
    comps: new Map(record.comps),
  }));
  const canonicalScores = data.records ? undefined : projectScoreboard(data);
  const scoreTimeline =
    canonicalScores?.scoreTimeline ??
    buildScoreTimeline(
      statRecords,
      match.Teams.map((t) => ({
        team: t.TeamId,
        score: t.Stats.CoreStats.Score,
      })),
    );
  const playerStats =
    canonicalScores?.playerStats ??
    buildPlayerStats(
      statRecords,
      match.Players.flatMap((p) => {
        const xuid = xuidOf(p.PlayerId);
        const core = p.PlayerTeamStats[0]?.Stats.CoreStats;
        return xuid && core
          ? [
              {
                xuid,
                score: core.PersonalScore,
                kills: core.Kills,
                deaths: core.Deaths,
                assists: core.Assists,
              },
            ]
          : [];
      }),
    );
  await stage('Reading player inventories...');
  const { inventories, inventoryDeltas } = records;
  await stage('Reading weapon fire and damage...');
  const { fireEvents, damageEvents, killEvents, playerGameEvents } = records;
  await stage('Tracing projectiles...');
  const flights = records.flights;
  await stage('Reading objectives...');

  const metersToFilm = normalizedPerMeter(mapId) ?? 0;
  const scan =
    category === GameVariantCategory.MultiplayerCtf ||
    category === GameVariantCategory.MultiplayerOddball
      ? records.worldObjects
      : { births: [], samples: [], drops: [] };
  let carries: ObjectiveCarries = {};
  if (!data.records) {
    const timeline =
      projectFlagTimeline(data, positions, objectives) ??
      projectOddballTimeline(data, positions, objectives);
    if (timeline) carries = { timeline };
  }
  if (scan.births.length > 0 || scan.drops.length > 0) {
    const flagHomes = objectives
      .filter((o) => o.role === 'flag_spawn')
      .map((o) => ({ team: o.team, x: o.x, y: o.y }));
    const skull = buildSkullObject(scan);
    carries = {
      objects:
        category === GameVariantCategory.MultiplayerCtf
          ? buildFlagObjects(scan, flagHomes)
          : skull
            ? [skull]
            : [],
      carryEvents: records.carryEvents,
      reach: metersToFilm > 0 ? CARRY_REACH_M * metersToFilm : undefined,
    };
  }

  const teamEvents = (
    events: { timeMs: number; slot: number }[],
  ): ZoneCapture[] =>
    events.flatMap((c) => {
      const team = scoreTimeline.teams.find((t) => t.slot === c.slot)?.team;
      return team === undefined ? [] : [{ timeMs: c.timeMs, team }];
    });
  const zoneObjectives = objectives.filter(
    (o) => o.role === 'strongholds_zone',
  );
  const zoneInput =
    category === GameVariantCategory.MultiplayerStrongholds
      ? {
          zones: zoneObjectives.map(
            (o): ZoneShape => ({
              team: o.team,
              x: o.x,
              y: o.y,
              radius: o.radius,
              polygon: o.polygon,
            }),
          ),
          captures: teamEvents(extractZoneCaptureSlots(statRecords)),
          secures: teamEvents(extractZoneSecureSlots(statRecords)),
        }
      : undefined;

  const hillInput: HillInput | undefined =
    category === GameVariantCategory.MultiplayerKingOfTheHill
      ? {
          hills: objectives
            .filter((o) => o.role === 'hill')
            .map(
              (o): ZoneShape => ({
                team: o.team,
                x: o.x,
                y: o.y,
                radius: o.radius,
                polygon: o.polygon,
              }),
            ),
          control: extractHillControl(statRecords).flatMap(
            ({ slot, points }) => {
              const team = scoreTimeline.teams.find(
                (t) => t.slot === slot,
              )?.team;
              return team === undefined ? [] : [{ team, points }];
            },
          ),
          scores: scoreTimeline.teams.flatMap(({ team, points }) => {
            if (team === undefined) return [];
            let previous = 0;
            return points.flatMap((p) => {
              const scored = p.value > previous;
              previous = p.value;
              return scored ? [{ timeMs: p.timeMs, team }] : [];
            });
          }),
        }
      : undefined;

  await stage('Building replay...');
  return {
    positions,
    scoreTimeline,
    playerStats,
    inventories,
    fireEvents,
    damageEvents,
    carries,
    endMs,
    zoneInput,
    hillInput,
    inventoryDeltas,
    killFeed: buildKillFeed(
      highlightEvents,
      positions,
      damageEvents,
      killEvents,
      records.roster,
      playerGameEvents,
    ).filter((entry) => !partial || entry.timeMs <= endMs),
    flights,
    metersToFilm,
    objectives,
    mapName,
    worldObjects: projectWorldObjects(data, positions),
    worldZones,
  };
}

export type ReplayBuildData = Awaited<ReturnType<typeof decodeReplay>>;

/** Constructs the callable replay from decoded, transferable data. */
export function createMatchReplay(data: ReplayBuildData): MatchReplay {
  const {
    positions,
    scoreTimeline,
    playerStats,
    inventories,
    fireEvents,
    damageEvents,
    carries,
    endMs,
    zoneInput,
    hillInput,
    inventoryDeltas,
    killFeed,
    flights,
    metersToFilm,
    objectives,
    mapName,
    worldObjects = [],
    worldZones,
  } = data;
  const replay = createReplay(
    positions,
    scoreTimeline,
    playerStats,
    inventories,
    fireEvents,
    damageEvents,
    carries,
    endMs,
    zoneInput,
    hillInput,
    inventoryDeltas,
  );
  const spawnTimes = positions.actors
    .flatMap((actor) => actor.lives.map((life) => life.startMs))
    .filter((timeMs) => timeMs >= replay.startMs && timeMs <= replay.endMs)
    .sort((first, second) => first - second);
  const firstSpawn = spawnTimes.find((timeMs) => replay.at(timeMs).length > 0);
  const firstSpawnMs =
    firstSpawn === undefined
      ? undefined
      : spawnTimes
          .filter(
            (timeMs) =>
              timeMs >= firstSpawn && timeMs <= firstSpawn + SPAWN_WAVE_MS,
          )
          .at(-1);
  return Object.assign(replay, {
    zones: worldZones?.zones.length
      ? (timeMs: number) => worldZonesAt(worldZones, timeMs)
      : replay.zones,
    hills: worldZones?.hills
      ? (timeMs: number) => worldHillsAt(worldZones, timeMs)
      : replay.hills,
    worldObjects: (timeMs: number) => worldObjectsAt(worldObjects, timeMs),
    firstSpawnMs,
    killFeed,
    projectiles: flights.map((flight): ReplayProjectile => {
      const xuid =
        flight.thrower === undefined
          ? undefined
          : playerStats.players[flight.thrower]?.xuid;
      return {
        flight,
        actor: replay.players.find((p) => p.xuid === xuid)?.actor,
        lingering: flight.lingers
          ? {
              untilMs: flight.detonation.timeMs + SHROUD_DURATION_MS,
              radius: SHROUD_RADIUS_M * metersToFilm,
            }
          : undefined,
      };
    }),
    map: { objectives, background: mapBackgroundFor(mapName) },
  });
}

/** Builds a replay from a film's chunks (still compressed, as the API serves them). */
export async function buildReplay(
  film: FilmManifest,
  chunks: readonly FilmChunkInput[],
  match: FilmMatchStats,
  onStage: (stage: string) => void,
  partial: boolean,
  signal?: AbortSignal,
): Promise<MatchReplay> {
  return createMatchReplay(
    await decodeReplay(film, chunks, match, onStage, partial, signal),
  );
}

export interface LoadFilmOptions {
  film: FilmManifest;
  match: FilmMatchStats;
  /** Fetches one chunk's bytes, e.g. `client.getFilmChunk(film.BlobStoragePathPrefix, index)`. */
  fetchChunk: (
    index: number,
    fileRelativePath: string,
  ) => Promise<ArrayBuffer | Uint8Array>;
  /** Chunks fetched at once. */
  concurrency?: number;
  onProgress?: (downloaded: number, total: number) => void;
  /** Called as each processing step starts. */
  onStage?: (stage: string) => void;
  /** Receives playable snapshots as a contiguous prefix of the film becomes available.
   * Player attribution and inferred stats can change as more data arrives.
   */
  onReplay?: (replay: MatchReplay, complete: boolean) => void;
  /** Requested seek time; its chunk is fetched before the remaining prefix. */
  getPriorityTime?: () => number | undefined;
  /** Override decoding, for example to run it in a worker. */
  decode?: typeof decodeReplay;
  signal?: AbortSignal;
}

/** Downloads a film's chunks and builds its replay. */
export async function loadFilm(options: LoadFilmOptions): Promise<MatchReplay> {
  const {
    film,
    match,
    fetchChunk,
    onProgress,
    onStage,
    onReplay,
    signal,
    getPriorityTime,
    decode = decodeReplay,
  } = options;
  const build = async (chunks: readonly FilmChunkInput[], partial: boolean) =>
    createMatchReplay(
      await decode(film, chunks, match, onStage, partial, signal),
    );
  const { Chunks } = film.CustomData;
  if (onReplay) {
    const requestedConcurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const concurrency = Number.isFinite(requestedConcurrency)
      ? Math.max(1, Math.floor(requestedConcurrency))
      : DEFAULT_CONCURRENCY;
    const chunks: FilmChunkInput[] = [];
    let next = 0;
    let batchSize = 1;
    let hasReplay = false;
    let downloaded = 0;
    const fetched = new Map<number, FilmChunkInput>();
    const scheduled = new Set<number>();
    const highlightIndex = Chunks.findIndex(
      (chunk) => chunk.ChunkType === CHUNK_TYPE_HIGHLIGHTS,
    );
    const priorityIndex = () => {
      const timeMs = getPriorityTime?.();
      if (timeMs === undefined || !Number.isFinite(timeMs)) return -1;
      const index = Chunks.findIndex(
        (chunk) =>
          chunk.ChunkType === 2 &&
          timeMs >= chunk.ChunkStartTimeOffsetMilliseconds &&
          timeMs <
            chunk.ChunkStartTimeOffsetMilliseconds + chunk.DurationMilliseconds,
      );
      if (index >= 0) return index;
      for (let index = Chunks.length - 1; index >= 0; index--) {
        const chunk = Chunks[index];
        if (
          chunk.ChunkType === 2 &&
          timeMs ===
            chunk.ChunkStartTimeOffsetMilliseconds + chunk.DurationMilliseconds
        )
          return index;
      }
      return -1;
    };
    while (next < Chunks.length) {
      signal?.throwIfAborted();
      let cursor = next;
      let failed = false;
      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, Chunks.length - next) },
          async () => {
            try {
              while (!failed) {
                signal?.throwIfAborted();
                const priority = priorityIndex();
                const end = Math.min(
                  priority >= next ? priority + 1 : next + batchSize,
                  Chunks.length,
                );
                while (cursor < end && scheduled.has(cursor)) cursor++;
                const index =
                  priority >= next && !scheduled.has(priority)
                    ? priority
                    : cursor < end
                      ? cursor++
                      : !hasReplay &&
                          highlightIndex >= next &&
                          !scheduled.has(highlightIndex)
                        ? highlightIndex
                        : -1;
                if (index < 0) return;
                scheduled.add(index);
                const chunk = Chunks[index];
                const data = await fetchChunk(
                  chunk.Index,
                  chunk.FileRelativePath,
                );
                if (failed) return;
                signal?.throwIfAborted();
                fetched.set(index, {
                  fileRelativePath: chunk.FileRelativePath,
                  index: chunk.Index,
                  chunkType: chunk.ChunkType,
                  startTimeOffsetMs: chunk.ChunkStartTimeOffsetMilliseconds,
                  durationMs: chunk.DurationMilliseconds,
                  data: new Uint8Array(data),
                });
                onProgress?.(++downloaded, Chunks.length);
              }
            } catch (error) {
              failed = true;
              throw error;
            }
          },
        ),
      );
      while (fetched.has(next)) {
        const chunk = fetched.get(next);
        if (!chunk) break;
        chunks.push(chunk);
        fetched.delete(next++);
      }
      const complete = next === Chunks.length;
      if (priorityIndex() >= next && !complete) continue;
      if (chunks.some((chunk) => chunk.chunkType === 2) || complete) {
        try {
          const highlights = fetched.get(highlightIndex);
          const replay = await build(
            highlights ? [...chunks, highlights] : chunks,
            !complete,
          );
          signal?.throwIfAborted();
          if (!hasReplay && replay.firstSpawnMs === undefined) {
            if (complete) throw new Error('No player positions found in film');
            continue;
          }
          onReplay(replay, complete);
          hasReplay = true;
          if (complete) return replay;
        } catch (error) {
          if (
            complete ||
            hasReplay ||
            !(error instanceof Error) ||
            error.message !== 'No player positions found in film'
          )
            throw error;
        }
      }
      if (hasReplay) batchSize *= 2;
    }
    return build(chunks, false);
  }
  const chunks = new Array<FilmChunkInput>(Chunks.length);
  const pending = Chunks.map((chunk, i) => ({ chunk, i }));
  let downloaded = 0;
  const worker = async () => {
    for (let next = pending.shift(); next; next = pending.shift()) {
      signal?.throwIfAborted();
      const { chunk, i } = next;
      chunks[i] = {
        fileRelativePath: chunk.FileRelativePath,
        index: chunk.Index,
        chunkType: chunk.ChunkType,
        startTimeOffsetMs: chunk.ChunkStartTimeOffsetMilliseconds,
        durationMs: chunk.DurationMilliseconds,
        data: new Uint8Array(
          await fetchChunk(chunk.Index, chunk.FileRelativePath),
        ),
      };
      signal?.throwIfAborted();
      downloaded += 1;
      onProgress?.(downloaded, Chunks.length);
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          options.concurrency ?? DEFAULT_CONCURRENCY,
          Chunks.length,
        ),
      },
      worker,
    ),
  );
  return build(chunks, false);
}

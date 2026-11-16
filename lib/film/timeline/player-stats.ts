import type { FilmChunkSource } from '../../../../../libs/halo-film/src/core/film-input';
import { realRounds, strictlyIncreasing, type ScorePoint } from './score';
import { extractStatRecords, type StatRecord } from '../../../../../libs/halo-film/src/decoders/stat-records';

const FIRST_PLAYER_SLOT = 10;
const LAST_PLAYER_SLOT = 24;
const MAX_COUNT = 300;
const MAX_PERSONAL_SCORE = 100000;

export interface PlayerStatSnapshot {
  score: number;
  kills: number;
  deaths: number;
  assists: number;
}

type StatKey = keyof PlayerStatSnapshot;

/** Where each counter lives: component id, channel and plausible ceiling. */
const STAT_SOURCES: Record<
  StatKey,
  { comp: number; channel: 'a' | 'b'; max: number }
> = {
  score: { comp: 1, channel: 'b', max: MAX_PERSONAL_SCORE },
  kills: { comp: 2, channel: 'a', max: MAX_COUNT },
  deaths: { comp: 2, channel: 'b', max: MAX_COUNT },
  assists: { comp: 3, channel: 'a', max: MAX_COUNT },
};
const STAT_KEYS: StatKey[] = ['score', 'kills', 'deaths', 'assists'];

export interface PlayerStatSeries {
  /** Stat entity slot (10, 12, ...). */
  slot: number;
  xuid?: string;
  series: Record<StatKey, ScorePoint[]>;
}

export interface PlayerStatTimeline {
  players: PlayerStatSeries[];
}

function counterPoints(
  records: readonly StatRecord[],
  slot: number,
  round: number,
  key: StatKey,
): ScorePoint[] {
  const { comp, channel, max } = STAT_SOURCES[key];
  const points: ScorePoint[] = [];
  for (const r of records) {
    if (r.slot !== slot || r.round !== round) continue;
    const v = r.comps.get(comp);
    if (!v) continue;
    const value = v[channel];
    if (value < 0 || value > max) continue;
    points.push({ timeMs: r.timeMs, value });
  }
  return strictlyIncreasing(points);
}

function last(points: ScorePoint[]): number {
  return points.at(-1)?.value ?? 0;
}

export interface FinalPlayerStats extends PlayerStatSnapshot {
  xuid: string;
}

/**
 * Per-player counters over time. Stat slots carry no identity, so they are
 * matched to players by their final counters, then by slot order.
 */
export function buildPlayerStats(
  records: readonly StatRecord[],
  finals: readonly FinalPlayerStats[] = [],
): PlayerStatTimeline {
  const rounds = realRounds(records);
  const slots = [
    ...new Set(
      records
        .filter(
          (r) =>
            r.slot >= FIRST_PLAYER_SLOT &&
            r.slot <= LAST_PLAYER_SLOT &&
            r.slot % 2 === 0,
        )
        .map((r) => r.slot),
    ),
  ].sort((a, b) => a - b);

  const players: PlayerStatSeries[] = slots.map((slot) => {
    const series: Record<StatKey, ScorePoint[]> = {
      score: [],
      kills: [],
      deaths: [],
      assists: [],
    };
    for (const key of STAT_KEYS) {
      let carried = 0;
      for (const round of rounds) {
        const run = counterPoints(records, slot, round, key);
        for (const p of run)
          series[key].push({ timeMs: p.timeMs, value: carried + p.value });
        carried += last(run);
      }
    }
    return { slot, series };
  });

  const unmatched = new Set(finals.map((f) => f.xuid));
  const closeness = (p: PlayerStatSeries, f: FinalPlayerStats) =>
    STAT_KEYS.reduce((n, k) => n + (last(p.series[k]) === f[k] ? 1 : 0), 0);
  // Exact-ish matches first: the best-agreeing pairs win.
  const pairs = players
    .flatMap((p) => finals.map((f) => ({ p, f, n: closeness(p, f) })))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.n - a.n);
  for (const { p, f } of pairs) {
    if (p.xuid || !unmatched.has(f.xuid)) continue;
    p.xuid = f.xuid;
    unmatched.delete(f.xuid);
  }
  const rest = finals.filter((f) => unmatched.has(f.xuid));
  players
    .filter((p) => !p.xuid)
    .forEach((p, i) => {
      if (rest[i]) p.xuid = rest[i].xuid;
    });
  return { players };
}

export async function extractPlayerStats(
  chunkSource: FilmChunkSource,
  finals: readonly FinalPlayerStats[] = [],
): Promise<PlayerStatTimeline> {
  return buildPlayerStats(await extractStatRecords(chunkSource), finals);
}

export function statsAt(
  series: PlayerStatSeries,
  timeMs: number,
): PlayerStatSnapshot {
  const out: PlayerStatSnapshot = { score: 0, kills: 0, deaths: 0, assists: 0 };
  for (const key of STAT_KEYS) {
    for (const p of series.series[key]) {
      if (p.timeMs > timeMs) break;
      out[key] = p.value;
    }
  }
  return out;
}

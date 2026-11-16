import type { FilmChunkSource } from '../../../../../libs/halo-film/src/core/film-input';
import { extractStatRecords, type StatRecord } from '../../../../../libs/halo-film/src/decoders/stat-records';

/** Stat component carrying the mode score as displayed (A channel). */
const MODE_SCORE_COMPONENT = 0;
const MAX_MODE_SCORE = 250;
const MIN_COHERENT_RUN = 3;
const MIN_ROUND_RECORDS = 25;
const MIN_ROUND_SHARE = 0.1;
const MAX_ROUND = 7;
const TEAM_SLOTS = [6, 8];

export interface ScorePoint {
  timeMs: number;
  /** Cumulative across rounds. */
  value: number;
}

export interface RoundScorePoint extends ScorePoint {
  round: number;
  /** Score within `round`, which starts over at 0 each round. */
  roundValue: number;
}

export interface TeamScoreSeries {
  slot: number;
  /** Halo team id, when it could be resolved from the final scores. */
  team?: number;
  points: RoundScorePoint[];
}

export interface RoundSpan {
  round: number;
  /** The reset into this round; the film start for the first. */
  startMs: number;
  /** When the round was decided, i.e. its winner's last point. */
  endMs: number;
  /** Slot of the team that won the round; undefined when it ended level. */
  winnerSlot?: number;
}

export interface ScoreTimeline {
  teams: TeamScoreSeries[];
  rounds: RoundSpan[];
}

/** Longest strictly increasing subsequence by value, input already chronological. */
export function strictlyIncreasing(points: ScorePoint[]): ScorePoint[] {
  const tails: number[] = [];
  const prev: number[] = [];
  points.forEach((p, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[tails[mid]].value < p.value) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const out: ScorePoint[] = [];
  for (
    let k = tails[tails.length - 1];
    k !== undefined && k >= 0;
    k = prev[k]
  ) {
    out.unshift(points[k]);
  }
  return out;
}

function modeScorePoints(
  records: readonly StatRecord[],
  slot: number,
  round: number,
): ScorePoint[] {
  const points: ScorePoint[] = [];
  for (const r of records) {
    if (r.slot !== slot || r.round !== round) continue;
    const v = r.comps.get(MODE_SCORE_COMPONENT);
    if (!v) continue;
    if (v.a < 0 || v.a > MAX_MODE_SCORE || v.b < 0 || v.b > MAX_MODE_SCORE)
      continue;
    points.push({ timeMs: r.timeMs, value: v.a });
  }
  return strictlyIncreasing(points);
}

/**
 * Rounds that really happened: either a coherent run of score emissions or
 * enough player records relative to the busiest round (a one-point round has
 * no run), and contiguous from round 0. Stray decodes show up isolated.
 */
export function realRounds(records: readonly StatRecord[]): number[] {
  const playerRecords = new Map<number, number>();
  for (const r of records) {
    if (TEAM_SLOTS.includes(r.slot)) continue;
    playerRecords.set(r.round, (playerRecords.get(r.round) ?? 0) + 1);
  }
  const busiest = Math.max(0, ...playerRecords.values());
  const rounds: number[] = [];
  for (let round = 0; round <= MAX_ROUND; round++) {
    const count = playerRecords.get(round) ?? 0;
    const material =
      count >= MIN_ROUND_RECORDS && count >= busiest * MIN_ROUND_SHARE;
    const coherent = TEAM_SLOTS.some(
      (slot) =>
        modeScorePoints(records, slot, round).length >= MIN_COHERENT_RUN,
    );
    if (!material && !coherent) break;
    rounds.push(round);
  }
  return rounds;
}

export function buildScoreTimeline(
  records: readonly StatRecord[],
  /** Final score of each team from the match stats, to resolve team ids. */
  finalScores: readonly { team: number; score: number }[] = [],
): ScoreTimeline {
  const rounds = realRounds(records);
  const teams: TeamScoreSeries[] = TEAM_SLOTS.map((slot) => {
    const points: RoundScorePoint[] = [];
    let carried = 0;
    for (const round of rounds) {
      const run = modeScorePoints(records, slot, round);
      for (const p of run) {
        points.push({
          timeMs: p.timeMs,
          value: carried + p.value,
          round,
          roundValue: p.value,
        });
      }
      if (run.length > 0) carried += run[run.length - 1].value;
    }
    return { slot, points };
  });
  const spans: RoundSpan[] = [];
  for (const round of rounds) {
    const finals = teams.map((t) =>
      t.points.filter((p) => p.round === round).at(-1),
    );
    const [a, b] = finals;
    const winnerIndex =
      a && (!b || a.roundValue > b.roundValue)
        ? 0
        : b && (!a || b.roundValue > a.roundValue)
          ? 1
          : undefined;
    const endMs = Math.max(0, ...finals.map((f) => f?.timeMs ?? 0));
    const previousEnd = spans.at(-1)?.endMs ?? -Infinity;
    const startMs =
      round === rounds[0]
        ? 0
        : Math.min(
            ...records
              .filter((r) => r.round === round && r.timeMs >= previousEnd)
              .map((r) => r.timeMs),
          );
    spans.push({
      round,
      startMs,
      endMs:
        winnerIndex === undefined
          ? endMs
          : (finals[winnerIndex]?.timeMs ?? endMs),
      winnerSlot:
        winnerIndex === undefined ? undefined : teams[winnerIndex].slot,
    });
  }

  const finals = teams.map((t) => t.points.at(-1)?.value ?? 0);
  const byScore = finalScores.filter(
    (s) => finalScores.filter((o) => o.score === s.score).length === 1,
  );
  const resolved = teams.map((_, i) =>
    byScore.find((s) => s.score === finals[i]),
  );
  if (resolved[0] && resolved[1] && resolved[0].team !== resolved[1].team) {
    teams.forEach((t, i) => (t.team = resolved[i]?.team));
  } else if (finalScores.length === 2) {
    // Scores tie or don't match the stats: slot order has matched team order.
    const ordered = [...finalScores].sort((a, b) => a.team - b.team);
    teams.forEach((t, i) => (t.team = ordered[i].team));
  }
  return { teams, rounds: spans };
}

export async function extractScoreTimeline(
  chunkSource: FilmChunkSource,
  finalScores: readonly { team: number; score: number }[] = [],
): Promise<ScoreTimeline> {
  return buildScoreTimeline(await extractStatRecords(chunkSource), finalScores);
}

/**
 * Whether the game is played in rounds that each restart the score. Overtime
 * resets the stats just like a new round does, but follows a level game, so
 * only rounds that were actually won count.
 */
export function isRoundBased(timeline: ScoreTimeline): boolean {
  return timeline.rounds.filter((r) => r.winnerSlot !== undefined).length > 1;
}

/** Score of a series within the round in progress at `timeMs`; 0 once a new round has reset it. */
export function roundScoreAt(
  timeline: ScoreTimeline,
  series: TeamScoreSeries,
  timeMs: number,
): number {
  const current = timeline.rounds.filter((r) => r.startMs <= timeMs).at(-1);
  if (!current) return 0;
  const point = series.points
    .filter((p) => p.round === current.round && p.timeMs <= timeMs)
    .at(-1);
  return point?.roundValue ?? 0;
}

/** Rounds a series' team had won by `timeMs`. */
export function roundsWonAt(
  timeline: ScoreTimeline,
  series: TeamScoreSeries,
  timeMs: number,
): number {
  return timeline.rounds.filter(
    (r) => r.winnerSlot === series.slot && r.endMs <= timeMs,
  ).length;
}

/** Score of a series at `timeMs` (0 before its first point). */
export function scoreAt(series: TeamScoreSeries, timeMs: number): number {
  let value = 0;
  for (const p of series.points) {
    if (p.timeMs > timeMs) break;
    value = p.value;
  }
  return value;
}

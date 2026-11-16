import type { StatRecord } from '../../../../../libs/halo-film/src/decoders/stat-records';
import { inside, type ZoneOccupant, type ZoneShape } from './zone-state';

/** Stat component of a team's hill control counter; its `a` channel counts controlled seconds. */
const HILL_CONTROL_COMPONENT = 23;
const TEAM_SLOTS = [6, 8];
const TICK_MS = 1000;
/** A counter tick covers the second before it, plus a little timing jitter. */
const CONTROL_WINDOW_MS = 1100;
const DEFAULT_SECONDS_PER_POINT = 40;

export interface HillControlPoint {
  timeMs: number;
  /** Cumulative seconds the team has controlled a hill. */
  seconds: number;
}

export interface HillControlSeries {
  team: number;
  points: HillControlPoint[];
}

export interface HillInput {
  hills: ZoneShape[];
  control: HillControlSeries[];
  /** Instants a team was awarded a point; each one resets every team's progress. */
  scores: { timeMs: number; team: number }[];
}

export interface HillTeamProgress {
  team: number;
  /** Fraction (0..1) of a point earned since the last point was scored. */
  progress: number;
}

export interface HillState {
  /** Index into the hills; undefined while the game has none active. */
  activeHill?: number;
  /** Team whose control counter is running, i.e. standing in the hill unopposed. */
  controllingTeam?: number;
  progress: HillTeamProgress[];
}

export interface HillTimeline {
  /** Controlled seconds that earn one point. */
  secondsPerPoint: number;
  at(timeMs: number): HillState;
}

/** Control counter points of each team slot, as `{slot, points}`, from the film's stat records. */
export function extractHillControl(
  records: readonly StatRecord[],
): { slot: number; points: HillControlPoint[] }[] {
  return TEAM_SLOTS.map((slot) => {
    const points: HillControlPoint[] = [];
    let seconds = 0;
    const own = records
      .filter((r) => r.slot === slot && r.comps.has(HILL_CONTROL_COMPONENT))
      .sort((a, b) => a.timeMs - b.timeMs);
    for (const r of own) {
      const value = r.comps.get(HILL_CONTROL_COMPONENT)?.a;
      // The counter only ever steps forward; anything else is a stray decode.
      if (
        value !== undefined &&
        value > seconds &&
        (points.length === 0 || value <= seconds + 5)
      ) {
        seconds = value;
        points.push({ timeMs: r.timeMs, seconds });
      }
    }
    return { slot, points };
  });
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function secondsAt(points: readonly HillControlPoint[], timeMs: number) {
  let seconds = 0;
  for (const p of points) {
    if (p.timeMs > timeMs) break;
    seconds = p.seconds;
  }
  return seconds;
}

interface Segment {
  startMs: number;
  endMs: number;
  /** Controlled seconds of each team when the segment began. */
  baseline: Map<number, number>;
  activeFromMs: number;
  hill?: number;
}

/**
 * Plays King of the Hill forward. Controlled seconds and the instants points
 * are scored are the game's own counters: every point resets both teams'
 * progress, and a team's progress is its controlled seconds since then. Which
 * hill is active is derived: it is the one the controlling team stood in when
 * its counter ticked.
 */
export function buildHillTimeline(
  input: HillInput,
  occupantsAt: (timeMs: number) => ZoneOccupant[],
  endMs: number,
): HillTimeline {
  const scores = [...input.scores].sort((a, b) => a.timeMs - b.timeMs);
  const boundaries = [0, ...scores.map((s) => s.timeMs)];
  const seriesOf = new Map(input.control.map((s) => [s.team, s.points]));
  const teams = [...seriesOf.keys()];

  const ticksIn = (startMs: number, stopMs: number) =>
    input.control.flatMap((s) =>
      s.points
        .filter((p) => p.timeMs > startMs && p.timeMs <= stopMs)
        .map((p) => ({ team: s.team, timeMs: p.timeMs })),
    );

  const segments: Segment[] = boundaries.map((startMs, i) => {
    const stop = i + 1 < boundaries.length ? boundaries[i + 1] : endMs;
    const votes = new Array<number>(input.hills.length).fill(0);
    for (const tick of ticksIn(startMs, stop)) {
      const there = occupantsAt(tick.timeMs - TICK_MS / 2).filter(
        (o) => o.team === tick.team,
      );
      input.hills.forEach((hill, h) => {
        votes[h] += there.filter((o) => inside(hill, o.x, o.y)).length;
      });
    }
    const top = Math.max(0, ...votes);
    return {
      startMs,
      endMs: stop,
      baseline: new Map(
        teams.map((t) => [t, secondsAt(seriesOf.get(t) ?? [], startMs)]),
      ),
      activeFromMs: startMs,
      hill: top > 0 ? votes.indexOf(top) : undefined,
    };
  });

  // After a point the game takes a moment to bring up the next hill; the
  // quickest first tick of any segment bounds that gap.
  const gaps = segments.slice(1).flatMap((seg) => {
    const first = ticksIn(seg.startMs, seg.endMs).sort(
      (a, b) => a.timeMs - b.timeMs,
    )[0];
    return first ? [first.timeMs - TICK_MS - seg.startMs] : [];
  });
  const handoverMs = Math.max(0, Math.min(...gaps, Infinity));
  segments.forEach((seg, i) => {
    if (i > 0) {
      seg.activeFromMs =
        seg.startMs + (Number.isFinite(handoverMs) ? handoverMs : 0);
    }
  });

  const secondsPerPoint =
    median(
      scores.flatMap((s) => {
        const points = seriesOf.get(s.team);
        const seg = segments.find((g) => g.endMs === s.timeMs);
        const base = seg?.baseline.get(s.team);
        return points && base !== undefined
          ? [secondsAt(points, s.timeMs) - base]
          : [];
      }),
    ) ?? DEFAULT_SECONDS_PER_POINT;

  const controlling = (team: number, timeMs: number) =>
    (seriesOf.get(team) ?? []).some(
      (p) => p.timeMs >= timeMs && p.timeMs <= timeMs + CONTROL_WINDOW_MS,
    );

  return {
    secondsPerPoint,
    at(timeMs) {
      const seg =
        [...segments]
          .filter((s) => s.startMs <= timeMs)
          .sort((a, b) => b.startMs - a.startMs)[0] ?? segments[0];
      const progress = teams.map((team): HillTeamProgress => {
        const points = seriesOf.get(team) ?? [];
        let seconds = secondsAt(points, timeMs) - (seg.baseline.get(team) ?? 0);
        const next = points.find((p) => p.timeMs > timeMs);
        if (
          next &&
          next.timeMs - timeMs <= TICK_MS &&
          next.timeMs <= seg.endMs
        ) {
          // Ease between whole-second ticks so the bar moves smoothly.
          seconds += 1 - (next.timeMs - timeMs) / TICK_MS;
        }
        return {
          team,
          progress: Math.min(1, Math.max(0, seconds / secondsPerPoint)),
        };
      });
      const active =
        seg.hill !== undefined &&
        timeMs >= seg.activeFromMs &&
        timeMs < seg.endMs;
      return {
        activeHill: active ? seg.hill : undefined,
        controllingTeam: teams.find((t) => controlling(t, timeMs)),
        progress,
      };
    },
  };
}

import type { StatRecord } from '@gravllift/halo-helpers/film-types';

/** Stat component of a team's zone-capture counter; its `b` channel counts captures. */
const ZONE_CAPTURE_COMPONENT = 20;
/** Stat component of a zone-secure counter; its `a` channel counts secures. */
const ZONE_SECURE_COMPONENT = 21;
const TEAM_SLOTS = [6, 8];
const STEP_MS = 250;
const MAX_CREDITED_OCCUPANTS = 3;
const MAX_PROGRESS_BEFORE_CAPTURE = 0.99;

export interface ZoneShape {
  /** Team that holds the zone when the match starts; -1 for neutral. */
  team: number;
  x: number;
  y: number;
  radius?: number;
  polygon?: [number, number][];
}

export interface ZoneCapture {
  timeMs: number;
  team: number;
}

export interface ZoneOccupant {
  x: number;
  y: number;
  team: number;
}

export interface ZoneState {
  contested?: boolean;
  inside?: (number | undefined)[];
  /** Index into the zones the timeline was built from. */
  zone: number;
  /** Holding team; -1 for neutral. */
  owner: number;
  /** Fraction (0..1) of a capture completed by `capturingTeam`. */
  progress: number;
  /** Team that is working on a capture; undefined when none is in progress. */
  capturingTeam?: number;
}

export interface ZoneTimeline {
  at(timeMs: number): ZoneState[];
}

/** Counter increments of a team stat, as `{timeMs, slot}`; only the next count is believed, which keeps stray decodes out. */
function counterIncrements(
  records: readonly StatRecord[],
  component: number,
  channel: 'a' | 'b',
): { timeMs: number; slot: number }[] {
  const out: { timeMs: number; slot: number }[] = [];
  for (const slot of TEAM_SLOTS) {
    let count = 0;
    const own = records
      .filter((r) => r.slot === slot && r.comps.has(component))
      .sort((a, b) => a.timeMs - b.timeMs);
    for (const r of own) {
      const value = r.comps.get(component)?.[channel];
      if (value === count + 1) {
        count = value;
        out.push({ timeMs: r.timeMs, slot });
      }
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/** Capture times read from the teams' zone-capture counters. */
export function extractZoneCaptureSlots(
  records: readonly StatRecord[],
): { timeMs: number; slot: number }[] {
  return counterIncrements(records, ZONE_CAPTURE_COMPONENT, 'b');
}

/**
 * Times a team secured a zone: the game's "Stronghold Secure" statistic, which
 * is awarded when an enemy capture in progress is stopped.
 */
export function extractZoneSecureSlots(
  records: readonly StatRecord[],
): { timeMs: number; slot: number }[] {
  return counterIncrements(records, ZONE_SECURE_COMPONENT, 'a');
}

export function inside(zone: ZoneShape, x: number, y: number): boolean {
  if (zone.polygon) {
    let hit = false;
    const pts = zone.polygon;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        hit = !hit;
      }
    }
    return hit;
  }
  return Math.hypot(x - zone.x, y - zone.y) <= (zone.radius ?? 0.005);
}

interface Snapshot {
  owner: number;
  effort: number;
  capturingTeam: number | undefined;
}

/**
 * Plays the zones forward. The capture instants and teams are the game's own;
 * which zone was taken and how far a capture has come are worked out from who
 * stands where: a lone team inside a zone it does not hold fills it, leaving
 * pauses it, a contest pauses it, and a different team starting over resets it.
 * How much standing time a full capture takes is learned from the captures.
 */
export function buildZoneTimeline(
  zones: readonly ZoneShape[],
  captures: readonly ZoneCapture[],
  occupantsAt: (timeMs: number) => ZoneOccupant[],
  endMs: number,
  secures: readonly ZoneCapture[] = [],
): ZoneTimeline {
  const ordered = [...captures].sort((a, b) => a.timeMs - b.timeMs);
  const orderedSecures = [...secures].sort((a, b) => a.timeMs - b.timeMs);
  let nextSecure = 0;
  const state: Snapshot[] = zones.map((z) => ({
    owner: z.team,
    effort: 0,
    capturingTeam: undefined,
  }));
  const history: Snapshot[][] = [];
  const completed: number[] = [];
  let nextCapture = 0;
  const steps = Math.max(1, Math.ceil(endMs / STEP_MS) + 1);
  for (let step = 0; step < steps; step++) {
    const timeMs = step * STEP_MS;
    const occupants = occupantsAt(timeMs);
    const counts = zones.map((zone) => {
      const byTeam = new Map<number, number>();
      for (const o of occupants) {
        if (inside(zone, o.x, o.y)) {
          byTeam.set(o.team, (byTeam.get(o.team) ?? 0) + 1);
        }
      }
      return byTeam;
    });
    state.forEach((s, i) => {
      const byTeam = counts[i];
      if (byTeam.size !== 1) return;
      const [[team, count]] = [...byTeam];
      if (team === s.owner) return;
      if (s.capturingTeam !== team) {
        s.capturingTeam = team;
        s.effort = 0;
      }
      s.effort += Math.min(count, MAX_CREDITED_OCCUPANTS) * (STEP_MS / 1000);
    });
    while (
      nextSecure < orderedSecures.length &&
      orderedSecures[nextSecure].timeMs <= timeMs
    ) {
      const { team } = orderedSecures[nextSecure++];
      // The securing team's zone whose capture by the enemy was under way.
      let best = -1;
      let bestPresent = -1;
      state.forEach((s, i) => {
        if (s.owner !== team || s.capturingTeam === undefined) return;
        const present = counts[i].get(team) ?? 0;
        if (present > bestPresent) {
          bestPresent = present;
          best = i;
        }
      });
      if (best >= 0) {
        state[best].effort = 0;
        state[best].capturingTeam = undefined;
      }
    }
    while (
      nextCapture < ordered.length &&
      ordered[nextCapture].timeMs <= timeMs
    ) {
      const { team } = ordered[nextCapture++];
      let best = -1;
      let bestScore = -Infinity;
      state.forEach((s, i) => {
        if (s.owner === team) return;
        const present = counts[i].get(team) ?? 0;
        const score =
          present * 1000 + (s.capturingTeam === team ? s.effort : 0);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best < 0) continue;
      const taken = state[best];
      if (taken.capturingTeam === team && taken.effort > 0) {
        completed.push(taken.effort);
      }
      taken.owner = team;
      taken.effort = 0;
      taken.capturingTeam = undefined;
    }
    history.push(state.map((s) => ({ ...s })));
  }
  const needed =
    completed.length > 0
      ? completed.slice().sort((a, b) => a - b)[completed.length >> 1]
      : 1;
  return {
    at(timeMs) {
      const step = Math.min(
        history.length - 1,
        Math.max(0, Math.floor(timeMs / STEP_MS)),
      );
      return history[step].map((s, zone) => ({
        zone,
        owner: s.owner,
        progress:
          s.capturingTeam === undefined
            ? 0
            : Math.min(MAX_PROGRESS_BEFORE_CAPTURE, s.effort / needed),
        capturingTeam: s.capturingTeam,
      }));
    },
  };
}

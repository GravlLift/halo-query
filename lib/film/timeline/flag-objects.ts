import type { FlagHome } from './replay';
import {
  FLAG_IDENTITY,
  SKULL_IDENTITY,
  type WorldObjectDrop,
  type WorldObjectScan,
} from '../../../../../libs/halo-film/src/decoders/world-object-births';

/** A flag that rests longer than this without a position update has stopped moving. */
const PATH_GAP_MS = 2000;
/** Position updates of a free flag arrive every frame; this is plenty for a path. */
const PATH_STEP_MS = 100;

export interface FlagPathPoint {
  timeMs: number;
  x: number;
  y: number;
}

/**
 * One flag of the game, as the engine tracks it. The engine creates a flag
 * object where it spawns whenever the flag resets (return, capture or falling
 * out of the world), and a new, positionless object each time a carrier puts
 * it down; the latter then replicates its position while it moves.
 */
export interface FlagObject {
  /** The oddball skull is tracked the same way as a flag. */
  kind: 'flag' | 'skull';
  /** Owning team; -1 for the neutral flag and the skull. */
  team: number;
  homeX: number;
  homeY: number;
  /** Times the flag was created at its spawn, ascending. */
  resets: number[];
  /** Times the flag was put down, with where it went, ascending. */
  drops: { timeMs: number; path: FlagPathPoint[] }[];
}

function nearestHome(
  homes: readonly FlagHome[],
  x: number,
  y: number,
): FlagHome | undefined {
  let best: FlagHome | undefined;
  let bestDistance = Infinity;
  for (const home of homes) {
    const d = Math.hypot(home.x - x, home.y - y);
    if (d < bestDistance) {
      best = home;
      bestDistance = d;
    }
  }
  return best;
}

export interface FlagGrab {
  /** Whatever identifies the carrier to the caller. */
  carrier: number;
  timeMs: number;
}

export interface FlagSegment {
  fromMs: number;
  /** Exclusive. */
  toMs: number;
  state: 'home' | 'dropped' | 'carried';
  carrier?: number;
  /** Where a dropped flag went. */
  path?: FlagPathPoint[];
}

/**
 * Where a flag was over time. A reset puts it at its spawn, a drop leaves it
 * lying where the carrier put it, and a grab hands it to a carrier; each state
 * lasts until the next of those events. The grabs are the ones that took this
 * flag, and come from the carriers' stat counters.
 */
export function buildFlagSegments(
  flag: FlagObject,
  grabs: readonly FlagGrab[],
  endMs: number,
): FlagSegment[] {
  type Event =
    | { timeMs: number; rank: number; kind: 'reset' }
    | {
        timeMs: number;
        rank: number;
        kind: 'drop';
        path: FlagPathPoint[];
      }
    | { timeMs: number; rank: number; kind: 'grab'; carrier: number };
  const events: Event[] = [
    ...flag.resets.map((timeMs): Event => ({ timeMs, rank: 0, kind: 'reset' })),
    ...flag.drops.map((d): Event => ({
      timeMs: d.timeMs,
      rank: 1,
      kind: 'drop',
      path: d.path,
    })),
    ...grabs.map((g): Event => ({
      timeMs: g.timeMs,
      rank: 2,
      kind: 'grab',
      carrier: g.carrier,
    })),
  ].sort((a, b) => a.timeMs - b.timeMs || a.rank - b.rank);
  return events.flatMap((event, i): FlagSegment[] => {
    const toMs = events[i + 1]?.timeMs ?? endMs;
    if (toMs <= event.timeMs) return [];
    const span = { fromMs: event.timeMs, toMs };
    switch (event.kind) {
      case 'reset':
        return [{ ...span, state: 'home' }];
      case 'drop':
        return [{ ...span, state: 'dropped', path: event.path }];
      case 'grab':
        return [{ ...span, state: 'carried', carrier: event.carrier }];
    }
  });
}

/** Groups the flag objects of a scan by the word that tells the flags apart. */
export function buildFlagObjects(
  scan: Pick<WorldObjectScan, 'births' | 'drops' | 'samples'>,
  homes: readonly FlagHome[],
): FlagObject[] {
  const births = scan.births.filter((b) => b.identity === FLAG_IDENTITY);
  const variants = [...new Set(births.map((b) => b.variant))];
  const objects: FlagObject[] = [];
  for (const variant of variants) {
    const own = births
      .filter((b) => b.variant === variant)
      .sort((a, b) => a.timeMs - b.timeMs);
    const votes = new Map<FlagHome, number>();
    for (const b of own) {
      const home = nearestHome(homes, b.normalized[0], b.normalized[1]);
      if (home) votes.set(home, (votes.get(home) ?? 0) + 1);
    }
    const home = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!home) continue;
    objects.push({
      kind: 'flag',
      team: home.team,
      homeX: home.x,
      homeY: home.y,
      resets: own.map((b) => b.timeMs),
      drops: dropsOf(
        scan,
        (d) => d.identity === FLAG_IDENTITY && d.variant === variant,
      ),
    });
  }
  return objects;
}

/** The oddball skull; there is only ever one. */
export function buildSkullObject(
  scan: Pick<WorldObjectScan, 'births' | 'drops' | 'samples'>,
): FlagObject | undefined {
  const births = scan.births
    .filter((b) => b.identity === SKULL_IDENTITY)
    .sort((a, b) => a.timeMs - b.timeMs);
  if (births.length === 0) return undefined;
  return {
    kind: 'skull',
    team: -1,
    homeX: births[0].normalized[0],
    homeY: births[0].normalized[1],
    resets: births.map((b) => b.timeMs),
    drops: dropsOf(scan, (d) => d.identity === SKULL_IDENTITY),
  };
}

function dropsOf(
  scan: Pick<WorldObjectScan, 'drops' | 'samples'>,
  wanted: (drop: WorldObjectDrop) => boolean,
): FlagObject['drops'] {
  return scan.drops
    .filter(wanted)
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((d) => {
      const path: FlagPathPoint[] = [];
      let last = d.timeMs;
      for (const s of scan.samples) {
        if (
          s.slot !== d.slot ||
          s.generation !== d.generation ||
          s.timeMs < d.timeMs
        ) {
          continue;
        }
        if (s.timeMs - last > PATH_GAP_MS) break;
        last = s.timeMs;
        const previous = path.at(-1);
        if (!previous || s.timeMs - previous.timeMs >= PATH_STEP_MS) {
          path.push({
            timeMs: s.timeMs,
            x: s.normalized[0],
            y: s.normalized[1],
          });
        }
      }
      return { timeMs: d.timeMs, path };
    });
}

/** Carry events of one holder that could be a pickup, placed where the holder stood. */
export interface GrabCandidate {
  carrier: number;
  team?: number;
  timeMs: number;
  x: number;
  y: number;
}

/** A pickup cannot coincide with the drop that made the object free; the carrier's own drop does. */
const DROP_SETTLE_MS = 60;

/**
 * Finds who took the object each time it lay free. It lies free from every
 * reset or drop until the next of either; the first candidate that is within
 * reach of it (and, for a flag, is not on its own team) picked it up. Whoever
 * carries it from there is let go of by the next drop or reset.
 */
export function findGrabs(
  object: FlagObject,
  candidates: readonly GrabCandidate[],
  reach: number,
): FlagGrab[] {
  const starts = [
    ...object.resets.map((timeMs) => ({
      timeMs,
      at: (): FlagPathPoint => ({
        timeMs,
        x: object.homeX,
        y: object.homeY,
      }),
    })),
    ...object.drops.map((d) => ({
      timeMs: d.timeMs,
      at: (t: number): FlagPathPoint | undefined =>
        d.path.filter((p) => p.timeMs <= t).at(-1) ?? d.path[0],
    })),
  ].sort((a, b) => a.timeMs - b.timeMs);
  const sorted = [...candidates].sort((a, b) => a.timeMs - b.timeMs);
  return starts.flatMap((start, i) => {
    const end = starts[i + 1]?.timeMs ?? Infinity;
    const grab = sorted.find((c) => {
      if (c.timeMs <= start.timeMs + DROP_SETTLE_MS || c.timeMs >= end) {
        return false;
      }
      if (object.team >= 0 && c.team === object.team) return false;
      const at = start.at(c.timeMs);
      return at !== undefined && Math.hypot(c.x - at.x, c.y - at.y) <= reach;
    });
    return grab ? [{ carrier: grab.carrier, timeMs: grab.timeMs }] : [];
  });
}

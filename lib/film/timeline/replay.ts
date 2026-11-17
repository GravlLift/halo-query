import type { LinkedFilmPositions } from '../../../../../libs/halo-film/src/decoders/positions';
import type { InventorySnapshot } from '../../../../../libs/halo-film/src/decoders/inventory';
import type { InventoryDelta } from '../../../../../libs/halo-film/src/decoders/inventory-deltas';
import type { FireEvent } from '../../../../../libs/halo-film/src/decoders/fire-events';
import type { DamageEvent } from '../../../../../libs/halo-film/src/decoders/damage-events';
import {
  GRENADE_NAMES,
  WEAPON_FAMILY_NAMES,
  abilityName,
} from '../../../../../libs/halo-film/src/core/weapon-catalog';
import {
  isRoundBased,
  roundScoreAt,
  roundsWonAt,
  scoreAt,
  type ScoreTimeline,
} from './score';
import type { CarryEvent } from '../../../../../libs/halo-film/src/decoders/carry-events';
import {
  buildFlagSegments,
  findGrabs,
  type FlagObject,
  type FlagPathPoint,
  type FlagSegment,
  type GrabCandidate,
} from './flag-objects';
import {
  buildHillTimeline,
  type HillInput,
  type HillState,
  type HillTimeline,
} from './hill-state';
import {
  buildZoneTimeline,
  type ZoneCapture,
  type ZoneShape,
  type ZoneState,
  type ZoneTimeline,
} from './zone-state';
import {
  statsAt,
  type PlayerStatSnapshot,
  type PlayerStatTimeline,
} from './player-stats';

export interface ReplayPoint {
  actor: number;
  slot: number;
  /** Fraction of the map's bounding box, [0, 1). */
  x: number;
  y: number;
  z: number;
  /** Look direction in degrees, atan2(y, x) convention on the normalized plane. */
  aimYawDeg?: number;
  /** Body facing when available, in the same convention as aim. */
  facingYawDeg?: number;
  aimPitchDeg?: number;
  /** Fractions; shield above 1 is overshield. Undefined until first seen. */
  health?: number;
  shield?: number;
}

export interface ReplayGrave {
  actor: number;
  /** When the life ended. */
  diedMs: number;
  /** Where the life ended, as a fraction of the map's bounding box. */
  x: number;
  y: number;
}

/** A final life that ends this close to the film's end is a survivor, not a death. */
const FINAL_LIFE_SLACK_MS = 2000;

export interface ReplayBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface LifeSamples {
  actor: number;
  slot: number;
  times: number[];
  xs: number[];
  ys: number[];
  zs: number[];
  yaws: (number | undefined)[];
  facingYaws: (number | undefined)[];
  pitches: (number | undefined)[];
  healths: (number | undefined)[];
  shields: (number | undefined)[];
}

interface TimedPoint {
  timeMs: number;
  x: number;
  y: number;
}

/** Cubic Hermite between `b` and `c`, with tangents from the neighbouring samples. */
function hermitePoint(
  a: TimedPoint,
  b: TimedPoint,
  c: TimedPoint,
  d: TimedPoint,
  timeMs: number,
): { x: number; y: number } {
  const h = c.timeMs - b.timeMs;
  const t = Math.min(1, Math.max(0, (timeMs - b.timeMs) / h));
  const slope = (p: TimedPoint, q: TimedPoint, axis: 'x' | 'y') =>
    q.timeMs > p.timeMs ? (q[axis] - p[axis]) / (q.timeMs - p.timeMs) : 0;
  const at = (axis: 'x' | 'y') => {
    const m0 = slope(a, c, axis) * h;
    const m1 = slope(b, d, axis) * h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * b[axis] +
      (t3 - 2 * t2 + t) * m0 +
      (-2 * t3 + 3 * t2) * c[axis] +
      (t3 - t2) * m1
    );
  };
  return { x: at('x'), y: at('y') };
}

/** Components are only sent when present in a record, so carry the last known value forward. */
function holdLast<T>(values: (T | undefined)[]): (T | undefined)[] {
  let last: T | undefined;
  return values.map((v) => (last = v ?? last));
}

/** Gaps longer than this between samples of one life are not interpolated across. */
const MAX_INTERPOLATION_GAP_MS = 500;
export interface Replay {
  startMs: number;
  endMs: number;
  actorCount: number;
  /** Identity of each actor, indexed by actor id. */
  players: { actor: number; xuid?: string; gamertag?: string; team?: number }[];
  /** Extent of every sampled position, for fitting a view. */
  bounds: ReplayBounds;
  /** Positions of every actor alive at `timeMs`. */
  at(timeMs: number): ReplayPoint[];
  /** Recent positions of an actor, oldest first, for drawing a trail. */
  trail(actor: number, timeMs: number, windowMs: number): ReplayPoint[];
  /**
   * Team scores at `timeMs`; empty when no score timeline was supplied. In a
   * round-based game `score` is the total across rounds, `roundScore` the
   * points of the round in progress and `roundsWon` the rounds taken so far.
   */
  scores(timeMs: number): {
    team?: number;
    score: number;
    roundScore?: number;
    roundsWon?: number;
    /** Points a round is played to. */
  }[];
  /** Counters and respawn state of an actor; undefined when the actor is unknown. */
  status(actor: number, timeMs: number): PlayerStatus | undefined;
  /** Last keyframe inventory of an actor at or before `timeMs`; refreshes about every 20 s. */
  loadout(actor: number, timeMs: number): PlayerLoadout | undefined;
  /** Flags and skulls that are held or lying where they were dropped at `timeMs`. */
  objectives(timeMs: number): ObjectiveState[];
  /** Owner and capture progress of every Strongholds zone, in the order they were supplied. */
  zones(timeMs: number): ZoneState[];
  /** Active hill, controlling team and per-team point progress; undefined outside King of the Hill. */
  hills(timeMs: number): HillState | undefined;
  /** Where each actor that is dead at `timeMs` died, until their next life begins. */
  graves(timeMs: number): ReplayGrave[];
  /** Shots fired by an actor in `(fromMs, toMs]`, oldest first. */
  fires(actor: number, fromMs: number, toMs: number): ReplayFire[];
}

export interface FlagHome {
  /** Owning team; -1 for the neutral-flag spawn. */
  team: number;
  x: number;
  y: number;
}

export interface ObjectiveCarries {
  timeline?: ObjectiveTimelineEvent[];
  /** The flags and the skull, as read from the objects themselves. */
  objects?: FlagObject[];
  /** Instants at which a biped took hold of or let go of something. */
  carryEvents?: CarryEvent[];
  /** How close, as a fraction of the map, a biped must be to take an object; unlimited when absent. */
  reach?: number;
}

export type ObjectiveTimelineEvent =
  | {
      timeMs: number;
      kind: 'flag' | 'skull';
      state: 'carried';
      actor: number;
      team?: number;
    }
  | {
      timeMs: number;
      kind: 'flag' | 'skull';
      state: 'home' | 'dropped';
      x: number;
      y: number;
      team?: number;
    }
  | { timeMs: number; kind: 'flag' | 'skull'; state: 'hidden'; team?: number };

export interface ObjectiveState {
  kind: 'flag' | 'skull';
  state: 'carried' | 'dropped' | 'home';
  /** Team that owns the flag (the one that is not carrying it); undefined for the skull. */
  team?: number;
  /** The carrier, while carried. */
  actor?: number;
  x: number;
  y: number;
}

interface FlagTrack {
  flag: FlagObject;
  segments: FlagSegment[];
}

/** Resolves each carry event to the actor that stood there, then lets every object find its pickups. */
function buildFlagTracks(
  carries: ObjectiveCarries,
  positions: LinkedFilmPositions,
  lives: LifeSamples[],
  endMs: number,
): FlagTrack[] {
  const teamOf = new Map(positions.actors.map((a) => [a.actor, a.team]));
  const candidates = (carries.carryEvents ?? []).flatMap(
    (event): GrabCandidate[] => {
      const life = lives.find(
        (l) =>
          l.slot === event.slot &&
          l.times[0] <= event.timeMs &&
          event.timeMs <= l.times[l.times.length - 1],
      );
      if (!life) return [];
      const i = Math.min(
        lowerBound(life.times, event.timeMs),
        life.times.length - 1,
      );
      return [
        {
          carrier: life.actor,
          team: teamOf.get(life.actor),
          timeMs: event.timeMs,
          x: life.xs[i],
          y: life.ys[i],
        },
      ];
    },
  );
  return (carries.objects ?? []).map((flag) => ({
    flag,
    segments: buildFlagSegments(
      flag,
      findGrabs(flag, candidates, carries.reach ?? Infinity),
      endMs,
    ),
  }));
}

export interface ReplayFire {
  timeMs: number;
  weapon: string;
  /** Aim heading of the shot, atan2(y, x) degrees, when the record had one. */
  aimYawDeg?: number;
}

export interface PlayerLoadout {
  /** Name of the drawn weapon, or the first carried one. */
  weapon?: string;
  /** True when the weapon comes from a shot fired after the keyframe. */
  weaponLive?: boolean;
  /** The carried weapon that is not drawn, with its last known ammo. */
  holstered?: { weapon: string; mag?: number; reserve?: number };
  /** False when the ammo reading belongs to a different weapon than `weapon`. */
  ammoKnown: boolean;
  /** Rounds in the magazine; undefined when no reading exists. */
  mag?: number;
  reserve?: number;
  /** Fraction of charge left for charge weapons. */
  chargeLeft?: number;
  /** Grenade types carried, with the selected one flagged. */
  grenades: { name: string; count: number; selected: boolean }[];
  equipment?: string;
  /** Keyframe time of the reading. */
  atMs: number;
}

export interface PlayerStatus {
  /** Undefined when stat records could not be tied to this player. */
  stats?: PlayerStatSnapshot;
  alive: boolean;
  /** Milliseconds until the next life starts, while dead between lives. */
  respawnInMs?: number;
}

function lowerBound(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(values: { timeMs: number }[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid].timeMs <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface LiveInventory {
  grenades?: number[];
  mag?: number;
  reserve?: number;
  /** Time of the newest delta reading used. */
  atMs?: number;
}

/**
 * Newest delta readings in (`afterMs`, `untilMs`] for grenades and the drawn
 * weapon slot; weapon readings must also be after `weaponAfterMs`.
 */
function liveInventory(
  deltas: InventoryDelta[],
  afterMs: number,
  untilMs: number,
  drawnSlot: number,
  weaponAfterMs = afterMs,
): LiveInventory {
  const live: LiveInventory = {};
  const note = (timeMs: number) => {
    live.atMs = Math.max(live.atMs ?? timeMs, timeMs);
  };
  for (let i = upperBound(deltas, untilMs) - 1; i >= 0; i--) {
    const delta = deltas[i];
    if (delta.timeMs <= afterMs) break;
    if (live.grenades === undefined && delta.grenades) {
      live.grenades = delta.grenades;
      note(delta.timeMs);
    }
    if (delta.timeMs <= weaponAfterMs) continue;
    const weapon = delta.weapons?.find((w) => w.weaponSlot === drawnSlot);
    if (live.mag === undefined && weapon?.mag !== undefined) {
      live.mag = weapon.mag;
      note(delta.timeMs);
    }
    if (live.reserve === undefined && weapon?.reserve !== undefined) {
      live.reserve = weapon.reserve;
      note(delta.timeMs);
    }
  }
  return live;
}

interface HeldWeapon {
  family: number;
  mag?: number;
  reserve?: number;
  /** Charge consumed, 0..1, for charge weapons (keyframes only). */
  gauge?: number;
}

type SlotEvent =
  | { timeMs: number; kind: 'delta'; delta: InventoryDelta }
  | { timeMs: number; kind: 'fire'; family: number };

/**
 * Replays the two weapon slots from a keyframe: delta records update each
 * slot's ammo, pickups fill a slot and draw it, and a shot draws the slot that
 * holds the fired weapon. Returns the drawn weapon and the one left in the
 * other slot.
 */
function trackWeaponSlots(
  keyframeCarried: number[],
  keyframeAmmo: { mag?: number; reserve?: number; gauge?: number }[],
  keyframeDrawn: number,
  events: SlotEvent[],
): { drawn?: HeldWeapon; holstered?: HeldWeapon } {
  const slots: (HeldWeapon | undefined)[] = [0, 1].map((i) =>
    keyframeCarried[i] === undefined || keyframeCarried[i] === 0
      ? undefined
      : {
          family: keyframeCarried[i],
          mag: keyframeAmmo[i]?.mag,
          reserve: keyframeAmmo[i]?.reserve,
          gauge: keyframeAmmo[i]?.gauge,
        },
  );
  let drawn = keyframeDrawn === 1 ? 1 : 0;
  const seenFamilies = new Set<number>();
  for (const index of [drawn, 1 - drawn]) {
    const held = slots[index];
    if (!held) continue;
    if (seenFamilies.has(held.family)) slots[index] = undefined;
    else seenFamilies.add(held.family);
  }
  for (const event of events) {
    if (event.kind === 'fire') {
      const index = slots.findIndex((s) => s?.family === event.family);
      if (index >= 0) drawn = index;
      else {
        slots[1 - drawn] =
          slots[1 - drawn]?.family === event.family
            ? undefined
            : slots[1 - drawn];
        slots[drawn] = { family: event.family };
      }
      continue;
    }
    const { pickup, weapons } = event.delta;
    if (pickup) {
      const target =
        pickup.weaponSlot === 0 || pickup.weaponSlot === 1
          ? pickup.weaponSlot
          : slots[0] && !slots[1]
            ? 1
            : drawn;
      for (let index = 0; index < slots.length; index++)
        if (index !== target && slots[index]?.family === pickup.family)
          slots[index] = undefined;
      slots[target] = { family: pickup.family };
      drawn = target;
    }
    for (const w of weapons ?? []) {
      const held = slots[w.weaponSlot];
      if (!held) continue;
      if (w.mag !== undefined) held.mag = w.mag;
      if (w.reserve !== undefined) held.reserve = w.reserve;
    }
  }
  return { drawn: slots[drawn], holstered: slots[1 - drawn] };
}

export function createReplay(
  positions: LinkedFilmPositions,
  scoreTimeline?: ScoreTimeline,
  playerStats?: PlayerStatTimeline,
  inventories: InventorySnapshot[] = [],
  fireEvents: FireEvent[] = [],
  _damageEvents: DamageEvent[] = [],
  objectiveCarries: ObjectiveCarries = {},
  filmEndMs?: number,
  zoneInput?: {
    zones: ZoneShape[];
    captures: ZoneCapture[];
    secures?: ZoneCapture[];
  },
  hillInput?: HillInput,
  inventoryDeltas: InventoryDelta[] = [],
): Replay {
  const actorsById = new Map(
    positions.actors.map((actor) => [actor.actor, actor]),
  );
  const deltasBySlot = new Map<number, InventoryDelta[]>();
  for (const delta of inventoryDeltas) {
    const list = deltasBySlot.get(delta.slot) ?? [];
    list.push(delta);
    deltasBySlot.set(delta.slot, list);
  }
  const firesBySlot = new Map<number, FireEvent[]>();
  for (const fire of [...fireEvents].sort((a, b) => a.timeMs - b.timeMs)) {
    const list = firesBySlot.get(fire.slot) ?? [];
    list.push(fire);
    firesBySlot.set(fire.slot, list);
  }
  /** Fires by `actor`, attributed by life so a recycled slot is not credited to another player. */
  const firesCache = new Map<number, FireEvent[]>();
  function actorFires(actor: number): FireEvent[] {
    const cached = firesCache.get(actor);
    if (cached) return cached;
    const entry = actorsById.get(actor);
    const fires = (entry?.lives ?? [])
      .flatMap((life) =>
        (firesBySlot.get(life.slot) ?? []).filter(
          (f) => f.timeMs >= life.startMs && f.timeMs <= life.endMs,
        ),
      )
      .sort((a, b) => a.timeMs - b.timeMs);
    firesCache.set(actor, fires);
    return fires;
  }
  const inventoriesBySlot = new Map<number, InventorySnapshot[]>();
  for (const snap of inventories) {
    // An empty reading (dead or unread) must not erase the previous full one.
    if (
      snap.weapons.length === 0 &&
      !snap.ammo?.length &&
      !snap.grenades?.length &&
      snap.abilityRank === undefined
    )
      continue;
    const list = inventoriesBySlot.get(snap.slot) ?? [];
    list.push(snap);
    inventoriesBySlot.set(snap.slot, list);
  }
  const slotTracks = new Map(positions.tracks.map((t) => [t.slot, t]));
  const lives: LifeSamples[] = [];
  const bounds: ReplayBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  // The film timeline begins at the start of the first chunk, not at the first sample.
  const startMs = 0;
  let endMs = -Infinity;
  for (const actor of positions.actors) {
    for (const life of actor.lives) {
      const track = slotTracks.get(life.slot);
      if (!track) continue;
      const samples = track.samples.filter(
        (s) => s.timeMs >= life.startMs && s.timeMs <= life.endMs,
      );
      if (samples.length === 0) continue;
      lives.push({
        actor: actor.actor,
        slot: life.slot,
        times: samples.map((s) => s.timeMs),
        xs: samples.map((s) => s.normalized[0]),
        ys: samples.map((s) => s.normalized[1]),
        zs: samples.map((s) => s.normalized[2]),
        yaws: holdLast(samples.map((s) => s.aimYawDeg)),
        facingYaws: holdLast(samples.map((s) => s.facingYawDeg)),
        pitches: holdLast(samples.map((s) => s.aimPitchDeg)),
        healths: holdLast(samples.map((s) => s.health)),
        shields: holdLast(samples.map((s) => s.shield)),
      });
      for (const s of samples) {
        bounds.minX = Math.min(bounds.minX, s.normalized[0]);
        bounds.maxX = Math.max(bounds.maxX, s.normalized[0]);
        bounds.minY = Math.min(bounds.minY, s.normalized[1]);
        bounds.maxY = Math.max(bounds.maxY, s.normalized[1]);
      }
      endMs = Math.max(endMs, samples[samples.length - 1].timeMs);
    }
  }
  if (filmEndMs !== undefined) endMs = filmEndMs;
  if (lives.length === 0) {
    endMs = filmEndMs ?? 0;
    Object.assign(bounds, { minX: 0, maxX: 1, minY: 0, maxY: 1 });
  } else {
    // Stray decode glitches would otherwise stretch the view; ignore the extreme tails.
    const trimmed = (values: number[]) => {
      const sorted = values.slice().sort((a, b) => a - b);
      const at = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      const lo = at(0.005);
      const hi = at(0.995);
      const pad = (hi - lo) * 0.05;
      return [lo - pad, hi + pad];
    };
    [bounds.minX, bounds.maxX] = trimmed(lives.flatMap((l) => l.xs));
    [bounds.minY, bounds.maxY] = trimmed(lives.flatMap((l) => l.ys));
  }

  function sample(life: LifeSamples, timeMs: number): ReplayPoint | null {
    const { times } = life;
    if (timeMs < times[0] || timeMs > times[times.length - 1]) return null;
    const next = lowerBound(times, timeMs);
    const prev = times[next] === timeMs ? next : Math.max(0, next - 1);
    const span = times[next] - times[prev];
    const t =
      span > 0 && span <= MAX_INTERPOLATION_GAP_MS
        ? (timeMs - times[prev]) / span
        : 0;
    const lerp = (values: number[]) =>
      values[prev] + (values[next] - values[prev]) * t;
    return {
      actor: life.actor,
      slot: life.slot,
      x: lerp(life.xs),
      y: lerp(life.ys),
      z: lerp(life.zs),
      aimYawDeg: life.yaws[prev],
      facingYawDeg: life.facingYaws[prev],
      aimPitchDeg: life.pitches[prev],
      health: life.healths[prev],
      shield: life.shields[prev],
    };
  }

  const teamByActor = new Map(positions.actors.map((a) => [a.actor, a.team]));
  let zoneTimeline: ZoneTimeline | undefined;
  let hillTimeline: HillTimeline | undefined;
  const occupantsAt = (t: number) =>
    lives.flatMap((life) => {
      const point = sample(life, t);
      const team = teamByActor.get(life.actor);
      return point && team !== undefined
        ? [{ x: point.x, y: point.y, team }]
        : [];
    });
  const livesByActor = new Map<number, LifeSamples[]>();
  for (const life of lives) {
    const list = livesByActor.get(life.actor) ?? [];
    list.push(life);
    livesByActor.set(life.actor, list);
  }
  for (const list of livesByActor.values()) {
    list.sort((a, b) => a.times[0] - b.times[0]);
  }
  const flagTracks = buildFlagTracks(objectiveCarries, positions, lives, endMs);
  const objectiveTimelines = new Map<string, ObjectiveTimelineEvent[]>();
  for (const event of objectiveCarries.timeline ?? []) {
    const key = `${event.kind}:${event.team ?? 'neutral'}`;
    const own = objectiveTimelines.get(key) ?? [];
    own.push(event);
    objectiveTimelines.set(key, own);
  }
  for (const own of objectiveTimelines.values())
    own.sort((first, second) => first.timeMs - second.timeMs);
  return {
    startMs,
    endMs,
    actorCount: positions.actors.length,
    players: positions.actors.map(({ actor, xuid, gamertag, team }) => ({
      actor,
      xuid,
      gamertag,
      team,
    })),
    bounds,
    scores(timeMs) {
      const timeline = scoreTimeline;
      return (timeline?.teams ?? []).map((series) => ({
        team: series.team,
        score: scoreAt(series, timeMs),
        ...(timeline && isRoundBased(timeline)
          ? {
              roundScore: roundScoreAt(timeline, series, timeMs),
              roundsWon: roundsWonAt(timeline, series, timeMs),
            }
          : {}),
      }));
    },
    status(actor, timeMs) {
      const entry = actorsById.get(actor);
      if (!entry) return undefined;
      const ordered = [...entry.lives].sort((a, b) => a.startMs - b.startMs);
      const current = ordered.find(
        (l) => l.startMs <= timeMs && timeMs <= l.endMs,
      );
      const next = ordered.find((l) => l.startMs > timeMs);
      const started = ordered.length > 0 && ordered[0].startMs <= timeMs;
      const series = entry.xuid
        ? playerStats?.players.find((p) => p.xuid === entry.xuid)
        : undefined;
      return {
        stats: series && statsAt(series, timeMs),
        alive: current !== undefined,
        respawnInMs:
          !current && started && next ? next.startMs - timeMs : undefined,
      };
    },
    loadout(actor, timeMs) {
      const entry = actorsById.get(actor);
      if (!entry) return undefined;
      let latest: InventorySnapshot | undefined;
      let latestLifeEnd = Infinity;
      for (const life of entry.lives) {
        for (const snap of inventoriesBySlot.get(life.slot) ?? []) {
          if (snap.timeMs > timeMs || snap.timeMs < life.startMs - 1000) {
            continue;
          }
          if (!latest || snap.timeMs > latest.timeMs) {
            latest = snap;
            latestLifeEnd = life.endMs;
          }
        }
      }
      if (!latest) return undefined;
      const keyframeDrawn = latest.drawnSlot ?? 0;
      const slotDeltas = deltasBySlot.get(latest.slot) ?? [];
      const until = Math.min(timeMs, latestLifeEnd);
      // A slot with neither a magazine nor a charge reading is empty.
      const slotAmmo = (latest.ammo ?? []).map((a) =>
        a.mag === undefined && a.gauge === undefined && a.reserve === 0
          ? { ...a, mag: 0 }
          : a,
      );
      // Delta readings newer than the keyframe replace what it recorded.
      const live = liveInventory(
        slotDeltas,
        latest.timeMs,
        until,
        keyframeDrawn,
      );
      const grenadeCounts = live.grenades ?? latest.grenades ?? [];
      const fires = actorFires(actor);
      const lastIndex = upperBound(fires, timeMs) - 1;
      const events = [
        ...slotDeltas
          .slice(
            upperBound(slotDeltas, latest.timeMs),
            upperBound(slotDeltas, until),
          )
          .map(
            (delta): SlotEvent => ({
              timeMs: delta.timeMs,
              kind: 'delta',
              delta,
            }),
          ),
        ...fires.slice(upperBound(fires, latest.timeMs), lastIndex + 1).map(
          (f): SlotEvent => ({
            timeMs: f.timeMs,
            kind: 'fire',
            family: f.family,
          }),
        ),
      ].sort(
        (a, b) =>
          a.timeMs - b.timeMs ||
          Number(a.kind === 'fire') - Number(b.kind === 'fire'),
      );
      // Pickups and shots after the keyframe are direct evidence of the weapons in hand.
      const tracked = trackWeaponSlots(
        latest.weapons.slice(0, 2),
        slotAmmo,
        keyframeDrawn,
        events,
      );
      const drawnWeapon = tracked.drawn ?? {
        family: latest.weapons[0],
        ...slotAmmo[keyframeDrawn],
      };
      const holsteredName =
        tracked.holstered && WEAPON_FAMILY_NAMES.get(tracked.holstered.family);
      const ammoKnown =
        drawnWeapon.mag !== undefined ||
        drawnWeapon.gauge !== undefined ||
        (latest.ammoKnown !== false &&
          events.every((e) => e.kind === 'delta' && !e.delta.pickup));
      return {
        weapon: WEAPON_FAMILY_NAMES.get(drawnWeapon.family),
        holstered:
          tracked.holstered && holsteredName
            ? {
                weapon: holsteredName,
                mag: tracked.holstered.mag,
                reserve: tracked.holstered.reserve,
              }
            : undefined,
        weaponLive: events.some(
          (e) => e.kind === 'fire' || (e.kind === 'delta' && e.delta.pickup),
        ),
        ammoKnown,
        mag: ammoKnown ? drawnWeapon.mag : undefined,
        reserve: ammoKnown ? drawnWeapon.reserve : undefined,
        chargeLeft:
          ammoKnown && drawnWeapon.gauge !== undefined
            ? 1 - drawnWeapon.gauge
            : undefined,
        grenades: grenadeCounts.flatMap((count, rank) =>
          count > 0
            ? [
                {
                  name: GRENADE_NAMES[rank],
                  count,
                  selected: latest.selectedGrenade === rank,
                },
              ]
            : [],
        ),
        equipment:
          latest.equipment ??
          (latest.abilityRank === undefined
            ? undefined
            : abilityName(latest.abilityRank)),
        atMs: live.atMs ?? latest.timeMs,
      };
    },
    zones(timeMs) {
      zoneTimeline ??= buildZoneTimeline(
        zoneInput?.zones ?? [],
        zoneInput?.captures ?? [],
        occupantsAt,
        endMs,
        zoneInput?.secures,
      );
      return zoneTimeline.at(timeMs);
    },
    hills(timeMs) {
      if (!hillInput) return undefined;
      hillTimeline ??= buildHillTimeline(hillInput, occupantsAt, endMs);
      return hillTimeline.at(timeMs);
    },
    objectives(timeMs) {
      if (objectiveCarries.timeline) {
        return [...objectiveTimelines.values()].flatMap<ObjectiveState>(
          (timeline) => {
            let low = 0;
            let high = timeline.length;
            while (low < high) {
              const middle = (low + high) >>> 1;
              if (timeline[middle].timeMs <= timeMs) low = middle + 1;
              else high = middle;
            }
            const event = timeline[low - 1];
            if (!event || event.state === 'hidden') return [];
            if (event.state === 'carried') {
              const life = livesByActor
                .get(event.actor)
                ?.find(
                  (life) =>
                    life.times[0] <= timeMs &&
                    timeMs <= life.times[life.times.length - 1],
                );
              const point = life && sample(life, timeMs);
              return point
                ? [
                    {
                      kind: event.kind,
                      state: event.state,
                      actor: event.actor,
                      team: event.team,
                      x: point.x,
                      y: point.y,
                    },
                  ]
                : [];
            }
            return [
              {
                kind: event.kind,
                state: event.state,
                team: event.team,
                x: event.x,
                y: event.y,
              },
            ];
          },
        );
      }
      const states: ObjectiveState[] = [];
      for (const track of flagTracks) {
        const segment = track.segments.find(
          (s) => s.fromMs <= timeMs && timeMs < s.toMs,
        );
        const team = track.flag.team >= 0 ? track.flag.team : undefined;
        if (!segment) continue;
        if (segment.state === 'home') {
          states.push({
            kind: track.flag.kind,
            state: 'home',
            team,
            x: track.flag.homeX,
            y: track.flag.homeY,
          });
        } else if (segment.state === 'dropped') {
          const path = segment.path ?? [];
          const nextIndex = path.findIndex((p) => p.timeMs > timeMs);
          const at =
            nextIndex < 0 ? path.at(-1) : path[Math.max(0, nextIndex - 1)];
          const next = nextIndex < 0 ? undefined : path[nextIndex];
          if (at) {
            const point =
              next && next.timeMs > at.timeMs && timeMs >= at.timeMs
                ? hermitePoint(
                    path[nextIndex - 2] ?? at,
                    at,
                    next,
                    path[nextIndex + 1] ?? next,
                    timeMs,
                  )
                : at;
            states.push({
              kind: track.flag.kind,
              state: 'dropped',
              team,
              x: point.x,
              y: point.y,
            });
          }
        } else {
          const life = lives.find(
            (l) =>
              l.actor === segment.carrier &&
              l.times[0] <= timeMs &&
              timeMs <= l.times[l.times.length - 1],
          );
          const point = life && sample(life, timeMs);
          if (point) {
            states.push({
              kind: track.flag.kind,
              state: 'carried',
              team,
              actor: segment.carrier,
              x: point.x,
              y: point.y,
            });
          }
        }
      }
      return states;
    },
    fires(actor, fromMs, toMs) {
      const fires = actorFires(actor);
      return fires
        .slice(upperBound(fires, fromMs), upperBound(fires, toMs))
        .map((fire) => {
          const life = (livesByActor.get(actor) ?? []).find(
            (entry) =>
              entry.times[0] <= fire.timeMs &&
              fire.timeMs <= entry.times[entry.times.length - 1],
          );
          return {
            timeMs: fire.timeMs,
            weapon: fire.weapon,
            aimYawDeg:
              fire.aimYawDeg ??
              (life ? sample(life, fire.timeMs)?.aimYawDeg : undefined),
          };
        });
    },
    graves(timeMs) {
      const graves: ReplayGrave[] = [];
      for (const [actor, own] of livesByActor) {
        const ended = own.filter((l) => l.times[l.times.length - 1] < timeMs);
        const life = ended.at(-1);
        if (!life) continue;
        const index = ended.length - 1;
        const diedMs = life.times[life.times.length - 1];
        const respawnMs = own[index + 1]?.times[0];
        if (
          respawnMs !== undefined
            ? respawnMs <= timeMs
            : diedMs >= endMs - FINAL_LIFE_SLACK_MS
        ) {
          continue;
        }
        const last = life.times.length - 1;
        graves.push({
          actor,
          diedMs,
          x: life.xs[last],
          y: life.ys[last],
        });
      }
      return graves;
    },
    at(timeMs) {
      const points: ReplayPoint[] = [];
      for (const life of lives) {
        const point = sample(life, timeMs);
        if (point) points.push(point);
      }
      return points;
    },
    trail(actor, timeMs, windowMs) {
      const points: ReplayPoint[] = [];
      for (const life of livesByActor.get(actor) ?? []) {
        const first = Math.max(life.times[0], timeMs - windowMs);
        const lastIndex = lowerBound(life.times, timeMs);
        const firstIndex = lowerBound(life.times, first);
        for (
          let i = firstIndex;
          i < Math.min(lastIndex, life.times.length);
          i++
        ) {
          points.push({
            actor,
            slot: life.slot,
            x: life.xs[i],
            y: life.ys[i],
            z: life.zs[i],
          });
        }
      }
      return points;
    },
  };
}

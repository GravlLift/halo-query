import type { FilmData } from '@gravllift/halo-helpers/film-data';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import {
  WEAPON_FAMILY_NAMES,
  EQUIPMENT_TAG_NAMES,
  isGrenadeFamily,
} from '@gravllift/halo-film-ui/film/core/weapon-catalog';
import {
  FLAG_IDENTITY,
  SKULL_IDENTITY,
} from '@gravllift/halo-film-ui/film/decoders/world-object-births';
import { field, items, number } from './film-json';
import { normalizedPoint } from './film-space';
import type { MapObjective } from '@gravllift/halo-infinite-maps';
import type { ZoneState } from './timeline/zone-state';
import type { HillState } from './timeline/hill-state';

export interface ReplayWorldObject {
  id: string;
  kind: 'weapon' | 'equipment' | 'grenade' | 'vehicle' | 'object';
  tag: number;
  x: number;
  y: number;
  label?: string;
  team?: number;
  riders?: number[];
  dropped?: boolean;
}

export interface WorldObjectTrack {
  object: ReplayWorldObject;
  fromMs: number;
  toMs?: number;
  path?: { timeMs: number; x: number; y: number }[];
  rides?: { fromMs: number; toMs: number; actor: number; team?: number }[];
}

const grenadeNames = new Map<number, string>([
  [0xbcabbe43, 'Frag Grenade'],
  [0xcaaadcb0, 'Plasma Grenade'],
]);
const objectiveTags = new Set([
  FLAG_IDENTITY,
  SKULL_IDENTITY,
  0x61dc4fdc,
  0xf075ae6a,
]);

export function projectWorldObjects(
  data: Pick<
    FilmData,
    | 'worldObjects'
    | 'groundWeapons'
    | 'vehicles'
    | 'rides'
    | 'players'
    | 'coordinates'
  >,
  positions: LinkedFilmPositions,
): WorldObjectTrack[] {
  const tracks: WorldObjectTrack[] = [];
  const vehicleTags = new Set(
    data.vehicles.flatMap((vehicle) => {
      const tag = number(field(vehicle, 'tag'));
      return tag === undefined ? [] : [tag];
    }),
  );
  for (const [source, objects] of [
    ['world', data.worldObjects],
    ['ground', data.groundWeapons],
  ] satisfies [string, FilmData['worldObjects']][]) {
    for (const [index, value] of objects.entries()) {
      const tag = number(field(value, 'tag'));
      const from = number(field(value, 'from'));
      const until = number(field(value, 'to'));
      const point = normalizedPoint(data.coordinates, field(value, 'position'));
      if (
        tag === undefined ||
        from === undefined ||
        !point ||
        objectiveTags.has(tag) ||
        vehicleTags.has(tag)
      )
        continue;
      const label =
        WEAPON_FAMILY_NAMES.get(tag) ??
        EQUIPMENT_TAG_NAMES.get(tag) ??
        grenadeNames.get(tag);
      const kind =
        grenadeNames.has(tag) || isGrenadeFamily(tag)
          ? 'grenade'
          : WEAPON_FAMILY_NAMES.has(tag) || source === 'ground'
            ? 'weapon'
            : EQUIPMENT_TAG_NAMES.has(tag)
              ? 'equipment'
              : 'object';
      tracks.push({
        object: {
          id: `${source}:${index}`,
          tag,
          kind,
          label,
          ...point,
          dropped: source === 'ground',
        },
        fromMs: (from * 1000) / 60,
        toMs: until === undefined ? undefined : (until * 1000) / 60,
      });
    }
  }
  for (const [index, vehicle] of data.vehicles.entries()) {
    const tag = number(field(vehicle, 'tag'));
    const path = items(field(vehicle, 'track'))
      .flatMap((entry) => {
        if (!Array.isArray(entry)) return [];
        const tick = number(entry[0]);
        const point = normalizedPoint(data.coordinates, entry[1]);
        return tick === undefined || !point
          ? []
          : [{ timeMs: (tick * 1000) / 60, ...point }];
      })
      .sort((first, second) => first.timeMs - second.timeMs);
    const first = path[0];
    if (tag === undefined || !first) continue;
    const rides = data.rides.flatMap((ride) => {
      if (number(field(ride, 'vehicle')) !== index) return [];
      const player = number(field(ride, 'player'));
      const from = number(field(ride, 'from'));
      const to = number(field(ride, 'to'));
      const actor =
        positions.actors[
          data.players.findIndex((entry) => entry.id === player)
        ];
      return from === undefined || to === undefined || !actor
        ? []
        : [
            {
              fromMs: (from * 1000) / 60,
              toMs: (to * 1000) / 60,
              actor: actor.actor,
              team: actor.team,
            },
          ];
    });
    tracks.push({
      object: {
        id: `vehicle:${index}`,
        tag,
        kind: 'vehicle',
        label: 'Vehicle',
        x: first.x,
        y: first.y,
      },
      fromMs: first.timeMs,
      toMs: (path.at(-1)?.timeMs ?? first.timeMs) + 1000 / 60,
      path,
      rides,
    });
  }
  return tracks;
}

export function worldObjectsAt(
  tracks: readonly WorldObjectTrack[],
  timeMs: number,
): ReplayWorldObject[] {
  const visible = new Map<string, ReplayWorldObject>();
  for (const track of tracks) {
    if (
      timeMs < track.fromMs ||
      (track.toMs !== undefined && timeMs >= track.toMs)
    )
      continue;
    let object = track.object;
    if (track.path?.length) {
      let low = 0;
      let high = track.path.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (track.path[middle].timeMs <= timeMs) low = middle + 1;
        else high = middle;
      }
      const before = track.path[Math.max(0, low - 1)];
      const next = track.path[low];
      const fraction =
        next &&
        next.timeMs > before.timeMs &&
        next.timeMs - before.timeMs <= 1000
          ? (timeMs - before.timeMs) / (next.timeMs - before.timeMs)
          : 0;
      const rides =
        track.rides?.filter(
          (ride) => ride.fromMs <= timeMs && timeMs <= ride.toMs,
        ) ?? [];
      object = {
        ...object,
        x: before.x + ((next?.x ?? before.x) - before.x) * fraction,
        y: before.y + ((next?.y ?? before.y) - before.y) * fraction,
        riders: rides.map((ride) => ride.actor),
        team: rides[0]?.team,
      };
    }
    const key =
      object.kind === 'vehicle'
        ? object.id
        : `${object.tag}:${Math.round(object.x * 100000)}:${Math.round(object.y * 100000)}`;
    visible.set(key, object);
  }
  return [...visible.values()];
}

export interface WorldZoneData {
  zones: {
    index: number;
    objective: MapObjective & { label?: string };
    states: (ZoneState & { timeMs: number })[];
  }[];
  hills?: {
    events: (HillState & { timeMs: number })[];
    toWin?: number;
    teams: { team: number; points: { timeMs: number; value: number }[] }[];
  };
}

function latest<T extends { timeMs: number }>(
  points: readonly T[],
  timeMs: number,
): T | undefined {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].timeMs <= timeMs) low = middle + 1;
    else high = middle;
  }
  return points[low - 1];
}

export function projectWorldZones(
  data: Pick<
    FilmData,
    'zones' | 'events' | 'hillScore' | 'players' | 'coordinates'
  >,
  positions: LinkedFilmPositions,
): WorldZoneData {
  const hill =
    data.hillScore !== null ||
    data.events.some((event) =>
      String(field(field(field(event, 'event'), 'Zone'), 'kind')).startsWith(
        'Hill',
      ),
    );
  const zones: WorldZoneData['zones'] = [];
  for (const [index, value] of data.zones.entries()) {
    const point = normalizedPoint(data.coordinates, field(value, 'position'));
    if (!point) continue;
    const shape = field(value, 'shape');
    const length = number(field(shape, 'a'));
    const width = number(field(shape, 'b'));
    const angle = number(field(shape, 'angle')) ?? 0;
    const objective: MapObjective & { label?: string } = {
      role: hill ? 'hill' : 'strongholds_zone',
      point: false,
      team: number(field(shape, 'team')) ?? -1,
      ...point,
    };
    const label = field(value, 'letter');
    objective.label = hill
      ? 'H'
      : typeof label === 'string'
        ? label
        : undefined;
    if (length !== undefined && data.coordinates) {
      if (field(shape, 'cylinder') === true)
        objective.radius = length / Math.abs(data.coordinates.scale_y * 32768);
      else if (width !== undefined) {
        const center = field(value, 'position');
        const horizontal = number(field(center, 'x'));
        const vertical = number(field(center, 'y'));
        if (horizontal !== undefined && vertical !== undefined) {
          objective.polygon = [
            [1, 1],
            [1, -1],
            [-1, -1],
            [-1, 1],
          ].flatMap(([forward, right]): [number, number][] => {
            const corner = normalizedPoint(data.coordinates, {
              x:
                horizontal +
                ((Math.cos(angle) * length) / 2) * forward +
                ((Math.sin(angle) * width) / 2) * right,
              y:
                vertical +
                ((Math.sin(angle) * length) / 2) * forward -
                ((Math.cos(angle) * width) / 2) * right,
            });
            return corner ? [[corner.x, corner.y]] : [];
          });
        }
      }
    }
    const states = items(field(value, 'states'))
      .flatMap((state) => {
        const tick = number(field(state, 'tick'));
        if (tick === undefined) return [];
        const insideMask = number(field(state, 'inside')) ?? 0;
        const inside = data.players.flatMap((player, actor) =>
          player.id >= 0 &&
          player.id < 32 &&
          ((insideMask >>> (31 - player.id)) & 1) === 1
            ? [positions.actors[actor]?.team ?? player.team ?? undefined]
            : [],
        );
        return [
          {
            timeMs: (tick * 1000) / 60,
            zone: zones.length,
            owner: number(field(state, 'owner')) ?? -1,
            capturingTeam: number(field(state, 'capturing')),
            progress: Math.max(
              0,
              Math.min(1, (number(field(state, 'progress')) ?? 0) / 100),
            ),
            contested: field(state, 'contested') === true,
            inside,
          },
        ];
      })
      .sort((first, second) => first.timeMs - second.timeMs);
    zones.push({ index, objective, states });
  }
  if (!hill) return { zones };
  const events: NonNullable<WorldZoneData['hills']>['events'] = [];
  let activeHill: number | undefined;
  let controllingTeam: number | undefined;
  for (const timed of data.events) {
    const event = field(field(timed, 'event'), 'Zone');
    const kind = field(event, 'kind');
    const tick = number(field(timed, 'tick'));
    if (tick === undefined) continue;
    const index = number(field(event, 'zone'));
    const zone =
      index === undefined
        ? undefined
        : zones.findIndex((zone) => zone.index === index);
    if (
      kind === 'HillAppear' ||
      kind === 'HillLive' ||
      kind === 'HillControlled'
    ) {
      if (zone !== undefined && zone >= 0) activeHill = zone;
      controllingTeam =
        kind === 'HillControlled' ? number(field(event, 'team')) : undefined;
    } else if (kind === 'HillWon') {
      activeHill = undefined;
      controllingTeam = undefined;
    } else if (
      kind === 'ControlLost' ||
      kind === 'ContestStart' ||
      kind === 'Neutral'
    )
      controllingTeam = undefined;
    else continue;
    events.push({
      timeMs: (tick * 1000) / 60,
      activeHill,
      controllingTeam,
      progress: [],
    });
  }
  events.sort((first, second) => first.timeMs - second.timeMs);
  const teams = new Map<number, { timeMs: number; value: number }[]>();
  for (const point of items(field(data.hillScore, 'points'))) {
    if (!Array.isArray(point)) continue;
    const tick = number(point[0]);
    const team = number(point[1]);
    const value = number(point[2]);
    if (tick === undefined || team === undefined || value === undefined)
      continue;
    const own = teams.get(team) ?? [];
    own.push({ timeMs: (tick * 1000) / 60, value });
    teams.set(team, own);
  }
  return {
    zones,
    hills: {
      events,
      toWin: number(field(data.hillScore, 'points_to_win')),
      teams: [...teams].map(([team, points]) => ({
        team,
        points: points.sort((first, second) => first.timeMs - second.timeMs),
      })),
    },
  };
}

export function worldZonesAt(data: WorldZoneData, timeMs: number): ZoneState[] {
  return data.zones.map((zone, index) => {
    const current = latest(zone.states, timeMs);
    return current ?? { zone: index, owner: zone.objective.team, progress: 0 };
  });
}

export function worldHillsAt(
  data: WorldZoneData,
  timeMs: number,
): HillState | undefined {
  if (!data.hills) return undefined;
  const current = latest(data.hills.events, timeMs);
  const progress = data.hills.teams.flatMap(({ team, points }) => {
    if (!data.hills?.toWin || data.hills.toWin <= 0) return [];
    return [
      {
        team,
        progress: Math.max(
          0,
          Math.min(1, (latest(points, timeMs)?.value ?? 0) / data.hills.toWin),
        ),
      },
    ];
  });
  return {
    activeHill: current?.activeHill,
    controllingTeam: current?.controllingTeam,
    progress,
  };
}

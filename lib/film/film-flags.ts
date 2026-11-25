import type { FilmData } from '@gravllift/halo-helpers/film-data';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import { FLAG_IDENTITY } from '@gravllift/halo-film-ui/film/decoders/world-object-births';
import type { ObjectiveTimelineEvent } from './timeline/replay';
import { eventOfType, field, number, tagNumber } from './film-json';
import { normalizedPoint } from './film-space';

type FlagData = Pick<
  FilmData,
  'mode' | 'events' | 'players' | 'coordinates' | 'groundWeapons' | 'kills'
>;
interface FlagAction {
  timeMs: number;
  rank: number;
  kind: 'grab' | 'return' | 'capture' | 'drop' | 'ground' | 'removed';
  actor?: number;
  point?: { x: number; y: number };
  ground?: number;
  taken?: boolean;
}

export function projectFlagTimeline(
  data: FlagData,
  positions: LinkedFilmPositions,
  objectives: readonly { role: string; team: number; x: number; y: number }[],
): ObjectiveTimelineEvent[] | undefined {
  const catalogHomes = objectives.filter(
    (objective) => objective.role === 'flag_spawn',
  );
  const teamHomes = catalogHomes.filter((home) => home.team >= 0);
  const homes = teamHomes.length >= 2 ? teamHomes : catalogHomes;
  if (homes.length === 0) return undefined;
  const actors = new Map(positions.actors.map((actor) => [actor.actor, actor]));
  const actorOf = (playerId: number | undefined) => {
    const index = data.players.findIndex((player) => player.id === playerId);
    return index >= 0 ? positions.actors[index]?.actor : undefined;
  };
  const teamOf = (actor: number | undefined) =>
    actor === undefined
      ? undefined
      : (actors.get(actor)?.team ?? data.players[actor]?.team ?? undefined);
  const pointAt = (actor: number | undefined, timeMs: number) => {
    if (actor === undefined) return undefined;
    const life = actors
      .get(actor)
      ?.lives.find(
        (life) => life.startMs <= timeMs + 125 && life.endMs >= timeMs - 1000,
      );
    const samples =
      life &&
      positions.tracks.find((track) => track.slot === life.slot)?.samples;
    if (!samples?.length) return undefined;
    let low = 0;
    let high = samples.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (samples[middle].timeMs <= timeMs) low = middle + 1;
      else high = middle;
    }
    const sample = samples[low - 1] ?? samples[0];
    return { x: sample.normalized[0], y: sample.normalized[1] };
  };
  const active = (actor: number | undefined, timeMs: number) =>
    actor !== undefined &&
    actors
      .get(actor)
      ?.lives.some(
        (life) => life.startMs <= timeMs + 125 && life.endMs >= timeMs,
      );
  const actions: FlagAction[] = [];
  for (const timed of data.events) {
    const tick = number(field(timed, 'tick'));
    if (tick === undefined) continue;
    const timeMs = (tick * 1000) / 60;
    const event = field(timed, 'event');
    const flag = eventOfType(event, 'flag');
    const kind = field(flag, 'kind');
    const actor = actorOf(number(field(flag, 'player')));
    const point = normalizedPoint(data.coordinates, field(flag, 'position'));
    if ((kind === 'grab' || kind === 'steal') && active(actor, timeMs))
      actions.push({ timeMs, rank: 4, kind: 'grab', actor, point });
    else if (kind === 'return')
      actions.push({ timeMs, rank: 2, kind: 'return', actor, point });
    else if (kind === 'capture')
      actions.push({ timeMs, rank: 2, kind: 'capture', actor, point });
    const pickup = eventOfType(event, 'pickup');
    if (tagNumber(field(pickup, 'item')) === FLAG_IDENTITY) {
      const owner = actorOf(number(field(pickup, 'player')));
      if (active(owner, timeMs))
        actions.push({ timeMs, rank: 5, kind: 'grab', actor: owner });
    }
    const thrown = eventOfType(event, 'throw');
    if (field(thrown, 'grenade') === null)
      actions.push({
        timeMs,
        rank: 3,
        kind: 'drop',
        actor: actorOf(number(field(thrown, 'player'))),
      });
  }
  for (const { tick, kill } of data.kills)
    actions.push({
      timeMs: (tick * 1000) / 60,
      rank: 3,
      kind: 'drop',
      actor: actorOf(kill.victim),
      point: normalizedPoint(
        data.coordinates,
        kill.position
          ? {
              x: kill.position.x,
              y: kill.position.y,
              z: kill.position.z ?? null,
            }
          : undefined,
      ),
    });
  for (const [ground, object] of data.groundWeapons.entries()) {
    if (tagNumber(field(object, 'tag')) !== FLAG_IDENTITY) continue;
    const point = normalizedPoint(data.coordinates, field(object, 'position'));
    const from = number(field(object, 'from'));
    const to = number(field(object, 'removed'));
    if (point && from !== undefined)
      actions.push({
        timeMs: (from * 1000) / 60,
        rank: 3,
        kind: 'ground',
        point,
        ground,
      });
    if (to !== undefined)
      actions.push({
        timeMs: (to * 1000) / 60,
        rank: 0,
        kind: 'removed',
        ground,
        taken: field(object, 'taken') === true,
      });
  }
  actions.sort(
    (first, second) => first.timeMs - second.timeMs || first.rank - second.rank,
  );
  const states = new Map<
    number,
    { actor?: number; point: { x: number; y: number }; ground?: number }
  >(homes.map((home) => [home.team, { point: home }]));
  const groundTeams = new Map<number, number>();
  const timeline: ObjectiveTimelineEvent[] = homes.map((home) => ({
    timeMs: 0,
    kind: 'flag',
    team: home.team,
    state: 'home',
    x: home.x,
    y: home.y,
  }));
  const nearest = (
    point: { x: number; y: number } | undefined,
    timeMs: number,
  ) => {
    if (!point) return undefined;
    const ranked = [...states]
      .map(([team, state]) => ({
        team,
        distance: Math.hypot(
          (state.actor === undefined
            ? state.point
            : (pointAt(state.actor, timeMs) ?? state.point)
          ).x - point.x,
          (state.actor === undefined
            ? state.point
            : (pointAt(state.actor, timeMs) ?? state.point)
          ).y - point.y,
        ),
      }))
      .sort((first, second) => first.distance - second.distance);
    return ranked[0]?.distance < 0.05 &&
      ranked[0].distance !== ranked[1]?.distance
      ? ranked[0].team
      : undefined;
  };
  const target = (action: FlagAction) => {
    const held = [...states].find(
      ([, state]) => state.actor !== undefined && state.actor === action.actor,
    )?.[0];
    if (held !== undefined && action.kind !== 'return') return held;
    const team = teamOf(action.actor);
    if (action.kind === 'return' && team !== undefined && states.has(team))
      return team;
    const opponents = homes.filter((home) => home.team !== team);
    if (team !== undefined && opponents.length === 1) return opponents[0].team;
    return nearest(
      action.point ?? pointAt(action.actor, action.timeMs),
      action.timeMs,
    );
  };
  for (const action of actions) {
    let team: number | undefined;
    if (action.kind === 'removed')
      team =
        action.ground === undefined
          ? undefined
          : groundTeams.get(action.ground);
    else if (action.kind === 'ground')
      team = nearest(action.point, action.timeMs);
    else if (action.kind === 'drop')
      team = [...states].find(
        ([, state]) =>
          action.actor !== undefined && state.actor === action.actor,
      )?.[0];
    else team = target(action);
    if (team === undefined) continue;
    const state = states.get(team);
    const home = homes.find((home) => home.team === team);
    if (!state || !home) continue;
    if (action.kind === 'grab' && action.actor !== undefined) {
      state.actor = action.actor;
      state.ground = undefined;
      state.point =
        action.point ?? pointAt(action.actor, action.timeMs) ?? state.point;
      timeline.push({
        timeMs: action.timeMs,
        kind: 'flag',
        team,
        state: 'carried',
        actor: action.actor,
      });
    } else if (
      action.kind === 'return' ||
      action.kind === 'capture' ||
      (action.kind === 'removed' && !action.taken)
    ) {
      if (action.kind === 'removed' && state.ground !== action.ground) continue;
      state.actor = undefined;
      state.ground = undefined;
      state.point = home;
      timeline.push({
        timeMs: action.timeMs,
        kind: 'flag',
        team,
        state: 'home',
        x: home.x,
        y: home.y,
      });
    } else if (action.kind === 'drop' || action.kind === 'ground') {
      state.point =
        action.kind === 'drop'
          ? (pointAt(state.actor, action.timeMs) ?? action.point ?? state.point)
          : (action.point ?? state.point);
      state.actor = undefined;
      state.ground = action.ground;
      if (action.ground !== undefined) groundTeams.set(action.ground, team);
      timeline.push({
        timeMs: action.timeMs,
        kind: 'flag',
        team,
        state: 'dropped',
        ...state.point,
      });
    } else if (action.kind === 'removed' && state.ground === action.ground) {
      state.ground = undefined;
      timeline.push({
        timeMs: action.timeMs,
        kind: 'flag',
        team,
        state: 'hidden',
      });
    }
  }
  return timeline;
}

import type { FilmData, JsonValue } from '@gravllift/halo-helpers/film-data';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import {
  FLAG_IDENTITY,
  SKULL_IDENTITY,
} from '@gravllift/halo-film-ui/film/decoders/world-object-births';
import type { ObjectiveTimelineEvent } from './timeline/replay';
import type { KillFeedPlayer } from './timeline/kill-feed';
import { eventOfType, field, number, tagNumber } from './film-json';

export interface ObjectiveFeedEntry {
  type: 'objective';
  timeMs: number;
  action: string;
  player?: KillFeedPlayer;
  team?: number;
}

export function projectObjectiveFeed(
  data: Pick<FilmData, 'events' | 'players'>,
  captures: readonly { timeMs: number; team: number }[] = [],
  positions?: LinkedFilmPositions,
  timeline?: readonly ObjectiveTimelineEvent[],
): ObjectiveFeedEntry[] {
  const entries: ObjectiveFeedEntry[] = [];
  const skullTimeline = timeline?.filter((event) => event.kind === 'skull');
  const playerFor = (id: number | undefined): KillFeedPlayer | undefined => {
    const player = data.players.find((candidate) => candidate.id === id);
    if (!player) return undefined;
    const actor = positions?.actors[data.players.indexOf(player)];
    return {
      xuid:
        'human' in player.kind
          ? String(player.kind.human.xuid)
          : `bot:${player.kind.bot.bot_id}`,
      gamertag:
        actor?.gamertag ??
        ('human' in player.kind
          ? (player.kind.human.gamertag ?? undefined)
          : player.kind.bot.name),
      team: actor?.team ?? player.team ?? undefined,
    };
  };
  for (const timed of data.events) {
    const tick = number(field(timed, 'tick'));
    if (tick === undefined || tick < 0) continue;
    const event = field(timed, 'event');
    const flag = eventOfType(event, 'flag');
    const zone = eventOfType(event, 'zone');
    const pickup = eventOfType(event, 'pickup');
    const flagKind = field(flag, 'kind');
    const zoneKind = field(zone, 'kind');
    const item = tagNumber(field(pickup, 'item'));
    let action: string | undefined;
    let source = flag;
    if (flagKind === 'grab' || flagKind === 'steal')
      action = 'grabbed the flag';
    else if (flagKind === 'capture') action = 'captured the flag';
    else if (flagKind === 'return') action = 'returned the flag';
    else if (zoneKind === 'skull_grab') {
      action = 'grabbed the oddball';
      source = zone;
    } else if (zoneKind === 'hill_controlled' || zoneKind === 'hill_won') {
      action =
        zoneKind === 'hill_won' ? 'captured the hill' : 'controlled the hill';
      source = zone;
    } else if (item === FLAG_IDENTITY || item === SKULL_IDENTITY) {
      action =
        item === FLAG_IDENTITY ? 'grabbed the flag' : 'grabbed the oddball';
      source = pickup;
    }
    if (!action || (action === 'grabbed the oddball' && skullTimeline?.length))
      continue;
    const timeMs = (tick * 1000) / 60;
    if (action === 'grabbed the oddball' && positions) {
      const playerIndex = data.players.findIndex(
        (player) => player.id === number(field(source, 'player')),
      );
      const lives = positions.actors[playerIndex]?.lives;
      if (
        lives?.length &&
        !lives.some(
          (life) => life.startMs <= timeMs + 125 && life.endMs >= timeMs,
        )
      )
        continue;
    }
    const entry: ObjectiveFeedEntry = {
      type: 'objective',
      timeMs,
      action,
      player: playerFor(number(field(source, 'player'))),
      team: number(field(source, 'team')),
    };
    const duplicate = entries.findIndex(
      (previous) =>
        previous.timeMs === timeMs &&
        previous.action === action &&
        (action === 'grabbed the oddball' ||
          (entry.player && previous.player?.xuid === entry.player.xuid) ||
          (!entry.player && !previous.player && previous.team === entry.team)),
    );
    if (duplicate >= 0 && pickup) entries[duplicate] = entry;
    else if (duplicate < 0) entries.push(entry);
  }
  let carrier: number | undefined;
  for (const event of skullTimeline ?? []) {
    if (event.state !== 'carried') {
      carrier = undefined;
      continue;
    }
    if (carrier === event.actor) continue;
    carrier = event.actor;
    const actor = positions?.actors.find((player) => player.actor === carrier);
    const player = actor?.xuid
      ? { xuid: actor.xuid, gamertag: actor.gamertag, team: actor.team }
      : undefined;
    entries.push({
      type: 'objective',
      timeMs: event.timeMs,
      action: 'grabbed the oddball',
      player,
    });
  }
  entries.push(
    ...captures.map(
      ({ timeMs, team }): ObjectiveFeedEntry => ({
        type: 'objective',
        timeMs,
        team,
        action: 'captured a zone',
      }),
    ),
  );
  return entries.sort((first, second) => first.timeMs - second.timeMs);
}

interface ObjectiveAction {
  timeMs: number;
  rank: number;
  state: 'spawn' | 'ground' | 'grab' | 'death' | 'hidden';
  actor?: number;
  point?: { x: number; y: number };
  ground?: number;
}

export function projectOddballTimeline(
  data: Pick<
    FilmData,
    | 'mode'
    | 'events'
    | 'players'
    | 'coordinates'
    | 'worldObjects'
    | 'groundWeapons'
    | 'kills'
  >,
  positions: LinkedFilmPositions,
  objectives: readonly { role: string; x: number; y: number }[],
): ObjectiveTimelineEvent[] | undefined {
  if (
    data.mode !== 'oddball' &&
    !data.events.some((event) =>
      ['skull_spawn', 'skull_grab'].includes(
        String(field(eventOfType(field(event, 'event'), 'zone'), 'kind')),
      ),
    )
  )
    return undefined;
  const coordinates = data.coordinates;
  const worldPoint = (value: JsonValue | undefined) => {
    const horizontal = number(field(value, 'x'));
    const vertical = number(field(value, 'y'));
    if (
      !coordinates ||
      coordinates.scale_x === 0 ||
      coordinates.scale_y === 0 ||
      horizontal === undefined ||
      vertical === undefined
    )
      return undefined;
    return {
      x: (vertical - coordinates.offset_y) / coordinates.scale_y / 32768,
      y: (coordinates.offset_x - horizontal) / coordinates.scale_x / 32768,
    };
  };
  const actorOf = (playerId: number | undefined) => {
    const index = data.players.findIndex((player) => player.id === playerId);
    return index >= 0 ? positions.actors[index]?.actor : undefined;
  };
  const canCarry = (actor: number, timeMs: number) =>
    positions.actors
      .find((player) => player.actor === actor)
      ?.lives.some(
        (life) => life.startMs <= timeMs + 125 && life.endMs >= timeMs,
      );
  const tracks = new Map(positions.tracks.map((track) => [track.slot, track]));
  const pointAt = (actorId: number, timeMs: number) => {
    const actor = positions.actors.find((actor) => actor.actor === actorId);
    const life = actor?.lives.find(
      (life) => life.startMs <= timeMs && life.endMs >= timeMs - 1000,
    );
    const samples = life && tracks.get(life.slot)?.samples;
    if (!samples?.length) return undefined;
    let low = 0;
    let high = samples.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (samples[middle].timeMs <= timeMs) low = middle + 1;
      else high = middle;
    }
    const sample = samples[low - 1];
    return sample
      ? { x: sample.normalized[0], y: sample.normalized[1] }
      : undefined;
  };
  const spawnObjects = data.worldObjects.filter(
    (object) => tagNumber(field(object, 'tag')) === SKULL_IDENTITY,
  );
  const homeAt = (timeMs: number) => {
    let latest: JsonValue | undefined;
    let latestTime = -Infinity;
    for (const object of spawnObjects) {
      const from = number(field(object, 'from'));
      const until = number(field(object, 'removed'));
      if (
        from === undefined ||
        (from * 1000) / 60 > timeMs ||
        (until !== undefined && (until * 1000) / 60 <= timeMs)
      )
        continue;
      if (from >= latestTime) {
        latest = object;
        latestTime = from;
      }
    }
    return (
      worldPoint(field(latest, 'position')) ??
      objectives.find((objective) => objective.role === 'oddball_spawn')
    );
  };
  const actions: ObjectiveAction[] = [];
  for (const [ground, object] of data.groundWeapons.entries()) {
    if (tagNumber(field(object, 'tag')) !== SKULL_IDENTITY) continue;
    const from = number(field(object, 'from'));
    const until = number(field(object, 'removed'));
    const point = worldPoint(field(object, 'position'));
    if (from !== undefined && point)
      actions.push({
        timeMs: (from * 1000) / 60,
        rank: 2,
        state: 'ground',
        point,
        ground,
      });
    if (until !== undefined)
      actions.push({
        timeMs: (until * 1000) / 60,
        rank: 0,
        state: 'hidden',
        ground,
      });
  }
  for (const timed of data.events) {
    const tick = number(field(timed, 'tick'));
    if (tick === undefined) continue;
    const timeMs = (tick * 1000) / 60;
    const event = field(timed, 'event');
    const zone = eventOfType(event, 'zone');
    if (field(zone, 'kind') === 'skull_spawn')
      actions.push({ timeMs, rank: 1, state: 'spawn' });
    if (field(zone, 'kind') === 'skull_grab') {
      const actor = actorOf(number(field(zone, 'player')));
      if (actor !== undefined && canCarry(actor, timeMs))
        actions.push({ timeMs, rank: 4, state: 'grab', actor });
    }
    const pickup = eventOfType(event, 'pickup');
    if (tagNumber(field(pickup, 'item')) === SKULL_IDENTITY) {
      const actor = actorOf(number(field(pickup, 'player')));
      if (actor !== undefined && canCarry(actor, timeMs))
        actions.push({ timeMs, rank: 5, state: 'grab', actor });
    }
    const thrown = eventOfType(event, 'throw');
    if (field(thrown, 'grenade') === null) {
      const actor = actorOf(number(field(thrown, 'player')));
      if (actor !== undefined)
        actions.push({ timeMs, rank: 3, state: 'death', actor });
    }
  }
  for (const { tick, kill } of data.kills) {
    const actor = actorOf(kill.victim);
    if (actor !== undefined)
      actions.push({
        timeMs: (tick * 1000) / 60,
        rank: 3,
        state: 'death',
        actor,
        point: worldPoint(
          kill.position
            ? {
                x: kill.position.x,
                y: kill.position.y,
                z: kill.position.z ?? null,
              }
            : undefined,
        ),
      });
  }
  actions.sort(
    (first, second) => first.timeMs - second.timeMs || first.rank - second.rank,
  );
  const timeline: ObjectiveTimelineEvent[] = [];
  let carrier: number | undefined;
  let ground: number | undefined;
  for (const action of actions) {
    let event: ObjectiveTimelineEvent | undefined;
    if (action.state === 'grab' && action.actor !== undefined) {
      carrier = action.actor;
      ground = undefined;
      event = {
        timeMs: action.timeMs,
        kind: 'skull',
        state: 'carried',
        actor: carrier,
      };
    } else if (action.state === 'death') {
      if (carrier === undefined || action.actor !== carrier) continue;
      const point = pointAt(carrier, action.timeMs) ?? action.point;
      carrier = undefined;
      ground = undefined;
      event = point
        ? { timeMs: action.timeMs, kind: 'skull', state: 'dropped', ...point }
        : { timeMs: action.timeMs, kind: 'skull', state: 'hidden' };
    } else if (action.state === 'spawn') {
      carrier = undefined;
      ground = undefined;
      const point = homeAt(action.timeMs);
      event = point
        ? {
            timeMs: action.timeMs,
            kind: 'skull',
            state: 'home',
            x: point.x,
            y: point.y,
          }
        : { timeMs: action.timeMs, kind: 'skull', state: 'hidden' };
    } else if (action.state === 'ground' && action.point) {
      carrier = undefined;
      ground = action.ground;
      event = {
        timeMs: action.timeMs,
        kind: 'skull',
        state: 'dropped',
        ...action.point,
      };
    } else if (action.state === 'hidden') {
      if (ground !== action.ground) continue;
      carrier = undefined;
      ground = undefined;
      event = { timeMs: action.timeMs, kind: 'skull', state: 'hidden' };
    }
    if (!event) continue;
    if (timeline.at(-1)?.timeMs === event.timeMs)
      timeline[timeline.length - 1] = event;
    else timeline.push(event);
  }
  return timeline;
}

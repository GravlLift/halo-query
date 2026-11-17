import type { FilmData, FilmRecordsData } from '@gravllift/halo-film';
import type { LinkedFilmPositions } from '../../../../libs/halo-film/src/decoders/positions';
import type { StatRecord } from '../../../../libs/halo-film/src/decoders/stat-records';
import {
  linkLives,
  type Actor,
} from '../../../../libs/halo-film/src/players/link-lives';
import type { ScoreTimeline } from './timeline/score';
import type { PlayerStatTimeline } from './timeline/player-stats';
import { field, items, number } from './film-json';
import { projectInventories } from './film-inventory';
import {
  WEAPON_FAMILY_NAMES,
  isGrenadeFamily,
} from '../../../../libs/halo-film/src/core/weapon-catalog';

const milliseconds = (tick: number) => (tick * 1000) / 60;

export function projectFilmData(data: FilmData): {
  positions: LinkedFilmPositions | null;
  records: FilmRecordsData;
} {
  const layout = {
    gateBits: 4 + (data.level?.indexBits ?? 1),
    axisBits: data.level?.play.widths ?? [15, 15, 15],
  };
  const widths: [number, number, number] = [
    layout.axisBits[0],
    layout.axisBits[1],
    layout.axisBits[2],
  ];
  const roster = data.players.map((player) => ({
    playerIndex: player.id,
    xuid:
      'Human' in player.kind
        ? String(player.kind.Human.xuid)
        : `bot:${player.kind.Bot.bot_id}`,
    gamertag:
      'Human' in player.kind
        ? (player.kind.Human.gamertag ?? String(player.kind.Human.xuid))
        : player.kind.Bot.name,
  }));
  const offsetMs =
    data.clock.highlightZero === null
      ? 0
      : milliseconds(data.clock.highlightZero);
  const slotForLife = (life: FilmData['lives'][number], index: number) =>
    data.records ? (life.entity ?? 0x200 + index) : 0x200 + index;
  const actors: Actor[] = data.players.map((player, actor) => ({
    actor,
    xuid: roster[actor].xuid,
    gamertag: roster[actor].gamertag,
    team: player.team ?? undefined,
    lives: data.lives.flatMap((life, index) => {
      if (life.player !== player.id || life.samples.length === 0) return [];
      return [
        {
          slot: slotForLife(life, index),
          startMs: milliseconds(life.samples[0].tick),
          endMs: milliseconds(life.death ?? life.samples.at(-1)?.tick ?? 0),
          sampleCount: life.samples.length,
        },
      ];
    }),
  }));
  const tracks = data.lives.flatMap((life, index) => {
    if (life.samples.length === 0) return [];
    return [
      {
        slot: slotForLife(life, index),
        samples: life.samples.map((sample) => {
          const z = sample.raw_z !== undefined ? sample.raw_z / 32768 : 0;
          const normalized: [number, number, number] = [
            sample.raw[0] / 32768,
            sample.raw[1] / 32768,
            z,
          ];
          const q: [number, number, number] = [
            normalized[0] * 2 ** widths[0],
            normalized[1] * 2 ** widths[1],
            normalized[2] * 2 ** widths[2],
          ];
          return {
            timeMs: milliseconds(sample.tick),
            normalized,
            q,
            aimYawDeg:
              sample.yaw === null
                ? undefined
                : (sample.yaw * 180) / Math.PI - 90,
            facingYawDeg:
              sample.facing_yaw == null
                ? undefined
                : (sample.facing_yaw * 180) / Math.PI - 90,
            aimPitchDeg:
              sample.pitch == null ? undefined : (sample.pitch * 180) / Math.PI,
            health: sample.health ?? undefined,
            shield: sample.shield ?? undefined,
          };
        }),
      },
    ];
  });
  const unownedSlots = new Set(
    data.lives.flatMap((life, index) =>
      life.player === null ? [slotForLife(life, index)] : [],
    ),
  );
  for (const actor of linkLives(
    tracks.filter((track) => unownedSlots.has(track.slot)),
  )) {
    actors.push({ ...actor, actor: actors.length });
  }
  const positions: LinkedFilmPositions | null = tracks.length
    ? {
        layout: { gateBits: layout.gateBits, axisBits: widths },
        flipRates: [],
        tracks,
        actors,
        highlightClockOffsetMs: offsetMs,
      }
    : null;
  if (data.records) return { positions, records: data.records };

  const records: FilmRecordsData = {
    roster,
    highlightEvents: [],
    statRecords: [],
    inventories: [],
    inventoryDeltas: [],
    fireEvents: [],
    damageEvents: [],
    killEvents: data.kills
      .filter(({ kill }) => kill.scored !== false)
      .map(({ tick, kill }) => ({
        timeMs: milliseconds(tick),
        victimIndex: kill.victim,
        killerIndex: kill.killer ?? 255,
        killerDamagePercent: kill.killer_damage_percent,
        assisterIndex: kill.assistant ?? undefined,
        assisterDamagePercent:
          kill.assistant === null ? undefined : kill.assistant_damage_percent,
      })),
    playerGameEvents: [],
    flights: [],
    worldObjects: { births: [], samples: [], drops: [] },
    carryEvents: [],
  };
  records.inventories = projectInventories(
    data,
    data.players.flatMap((player, index) =>
      actors[index].lives.map((life) => ({ ...life, playerId: player.id })),
    ),
  );
  const slotAt = (playerId: number | undefined, timeMs: number) => {
    const index = data.players.findIndex((player) => player.id === playerId);
    return actors[index]?.lives.find(
      (life) => timeMs >= life.startMs && timeMs <= life.endMs,
    )?.slot;
  };
  const roundStarts = data.scoreboard.clock
    .filter(
      (clock, index, clocks) =>
        index > 0 &&
        clock.limit > 0 &&
        clock.left >= clock.limit - 0.5 &&
        clocks[index - 1].left < clocks[index - 1].limit - 0.5,
    )
    .map((clock) => clock.tick);
  const stats = new Map<string, StatRecord>();
  for (const change of data.scoreboard.changes) {
    const slot =
      'Team' in change.owner
        ? 6 + change.owner.Team * 2
        : 10 +
          data.players.findIndex(
            (player) =>
              'Player' in change.owner && player.id === change.owner.Player,
          ) *
            2;
    const round =
      change.round ?? roundStarts.filter((tick) => tick <= change.tick).length;
    const key = `${change.tick}:${slot}:${round}`;
    let record = stats.get(key);
    if (!record) {
      record = {
        timeMs: milliseconds(change.tick),
        slot,
        round,
        comps: new Map(),
      };
      stats.set(key, record);
    }
    const component = Math.floor(change.slot / 2);
    const value = record.comps.get(component) ?? { a: 0, b: 0 };
    if (change.slot % 2 === 0) value.a = change.value;
    else value.b = change.value;
    record.comps.set(component, value);
  }
  records.statRecords = [...stats.values()]
    .sort((first, second) => first.timeMs - second.timeMs)
    .map((record) => ({ ...record, comps: [...record.comps] }));
  for (const highlight of data.highlights) {
    const tick = number(field(highlight, 'tick'));
    const xuid = number(field(highlight, 'xuid'));
    const gamertag = field(highlight, 'gamertag');
    const kind = field(highlight, 'kind');
    if (tick === undefined || xuid === undefined) continue;
    records.highlightEvents.push({
      xuid: String(xuid),
      gamertag: typeof gamertag === 'string' ? gamertag : String(xuid),
      type:
        kind === 'Kill'
          ? 'kill'
          : kind === 'Death'
            ? 'death'
            : kind === 'Mode'
              ? 'mode'
              : 'medal',
      timeMs: milliseconds(tick) - offsetMs,
      typeHint: kind === 'Death' ? 20 : kind === 'Kill' ? 50 : 10,
      isMedal: number(field(kind, 'Medal')) !== undefined,
      medalType: number(field(kind, 'Medal')) ?? 0,
    });
  }
  for (const timed of data.events) {
    const tick = number(field(timed, 'tick'));
    if (tick === undefined) continue;
    const timeMs = milliseconds(tick);
    const event = field(timed, 'event');
    const shot = field(event, 'Shot');
    const slot = slotAt(number(field(shot, 'player')), timeMs);
    const weapon = number(field(shot, 'weapon'));
    if (slot !== undefined && weapon !== undefined)
      records.fireEvents.push({ timeMs, slot, family: weapon, weapon: '' });
    const hit = field(event, 'Hit');
    const victimSlot = slotAt(number(field(hit, 'victim')), timeMs);
    if (victimSlot !== undefined)
      records.damageEvents.push({
        timeMs,
        victimSlot,
        attackerSlot: slotAt(number(field(hit, 'attacker')), timeMs),
        magnitude:
          (number(field(hit, 'shield')) ?? 0) +
          (number(field(hit, 'body')) ?? 0),
      });
    const pickup = field(event, 'Pickup');
    const pickupSlot = slotAt(number(field(pickup, 'player')), timeMs);
    const family = number(field(pickup, 'item'));
    if (
      pickupSlot !== undefined &&
      family !== undefined &&
      WEAPON_FAMILY_NAMES.has(family) &&
      !isGrenadeFamily(family)
    )
      records.inventoryDeltas.push({
        timeMs,
        slot: pickupSlot,
        pickup: { family, weaponSlot: number(field(pickup, 'slot')) },
      });
  }
  for (const entry of data.states) {
    if (typeof entry.playerId !== 'number') continue;
    for (const value of items(field(entry.state, 'ammo'))) {
      const tick = number(field(value, 'tick'));
      const weaponSlot = number(field(value, 'slot'));
      if (tick === undefined || weaponSlot === undefined) continue;
      const timeMs = milliseconds(tick);
      const slot = slotAt(entry.playerId, timeMs);
      if (slot !== undefined)
        records.inventoryDeltas.push({
          timeMs,
          slot,
          weapons: [
            {
              weaponSlot,
              mag: number(field(value, 'loaded')),
              reserve: number(field(value, 'reserve')),
            },
          ],
        });
    }
    for (const value of items(field(entry.state, 'grenades'))) {
      const tick = number(field(value, 'tick'));
      if (tick === undefined) continue;
      const timeMs = milliseconds(tick);
      const slot = slotAt(entry.playerId, timeMs);
      const counts = items(field(value, 'counts')).flatMap((value) =>
        typeof value === 'number' ? [value] : [],
      );
      if (slot !== undefined && counts.length === 4)
        records.inventoryDeltas.push({ timeMs, slot, grenades: counts });
    }
  }
  const coordinates = data.coordinates;
  if (coordinates && coordinates.scale_x !== 0 && coordinates.scale_y !== 0) {
    for (const flight of data.grenadeFlights) {
      const points = flight.path.map(([tick, position]) => ({
        timeMs: milliseconds(tick),
        x: (position.y - coordinates.offset_y) / coordinates.scale_y / 32768,
        y: (coordinates.offset_x - position.x) / coordinates.scale_x / 32768,
        z: 0,
      }));
      const end = points.at(-1);
      if (!end) continue;
      records.flights.push({
        thrower: data.players.findIndex(
          (player) => player.id === flight.player,
        ),
        points,
        explodes: flight.explodes ?? true,
        lingers: flight.lingers ?? false,
        detonation: {
          ...end,
          timeMs: milliseconds(flight.end),
          fromFilm: flight.deleted,
        },
      });
    }
  }
  records.inventoryDeltas.sort((first, second) => first.timeMs - second.timeMs);
  return { positions, records };
}

export function projectScoreboard(data: FilmData): {
  scoreTimeline: ScoreTimeline;
  playerStats: PlayerStatTimeline;
} {
  const starts = data.scoreboard.clock
    .filter(
      (clock, index, clocks) =>
        index > 0 &&
        clock.limit > 0 &&
        clock.left >= clock.limit - 0.5 &&
        clocks[index - 1].left < clocks[index - 1].limit - 0.5,
    )
    .map((clock) => clock.tick);
  const roundAt = (tick: number) =>
    starts.filter((start) => start <= tick).length;
  const teamIds = [
    ...new Set(
      data.scoreboard.changes.flatMap((change) =>
        'Team' in change.owner ? [change.owner.Team] : [],
      ),
    ),
  ];
  const teams = teamIds.map((team) => {
    let round = 0;
    let carried = 0;
    let previous = 0;
    const points = data.scoreboard.changes.flatMap((change) => {
      if (
        !('Team' in change.owner) ||
        change.owner.Team !== team ||
        change.slot !== 0
      )
        return [];
      const current = change.round ?? roundAt(change.tick);
      if (current !== round) {
        carried += previous;
        round = current;
      }
      previous = change.value;
      return [
        {
          timeMs: milliseconds(change.tick),
          value: carried + change.value,
          round,
          roundValue: change.value,
        },
      ];
    });
    return { slot: 6 + team * 2, team, points };
  });
  const rounds = [0, ...starts].map((tick, round) => {
    const finals = teams.map((team) => ({
      slot: team.slot,
      point: team.points.filter((point) => point.round === round).at(-1),
    }));
    const ordered = finals
      .filter((entry) => entry.point)
      .sort(
        (first, second) =>
          (second.point?.roundValue ?? 0) - (first.point?.roundValue ?? 0),
      );
    return {
      round,
      startMs: milliseconds(tick),
      endMs: milliseconds(starts[round] ?? data.clock.end),
      winnerSlot:
        ordered.length > 0 &&
        ordered[0].point?.roundValue !== ordered[1]?.point?.roundValue
          ? ordered[0].slot
          : undefined,
    };
  });
  const players = data.players.map((player, index) => {
    const series: PlayerStatTimeline['players'][number]['series'] = {
      score: [],
      kills: [],
      deaths: [],
      assists: [],
    };
    const sources: { key: keyof typeof series; slot: number }[] = [
      { key: 'score', slot: 3 },
      { key: 'kills', slot: 4 },
      { key: 'deaths', slot: 5 },
      { key: 'assists', slot: 6 },
    ];
    for (const source of sources) {
      let carried = 0;
      let previous = 0;
      let round = 0;
      for (const change of data.scoreboard.changes) {
        if (
          !('Player' in change.owner) ||
          change.owner.Player !== player.id ||
          change.slot !== source.slot
        )
          continue;
        const current = change.round ?? roundAt(change.tick);
        if (current !== round) {
          carried += previous;
          round = current;
        }
        previous = change.value;
        series[source.key].push({
          timeMs: milliseconds(change.tick),
          value: carried + change.value,
        });
      }
    }
    return {
      slot: 10 + index * 2,
      xuid:
        'Human' in player.kind
          ? String(player.kind.Human.xuid)
          : `bot:${player.kind.Bot.bot_id}`,
      series,
    };
  });
  return { scoreTimeline: { teams, rounds }, playerStats: { players } };
}

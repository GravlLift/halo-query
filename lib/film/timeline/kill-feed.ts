import type {
  DamageEvent,
  FilmPlayer,
  HighlightEvent,
  LinkedFilmPositions,
  PlayerGameEvent,
  PlayerKilledEvent,
} from '@gravllift/halo-helpers/film-types';

const KILL_EVENT_PAIR_WINDOW_MS = 250;
const HIGHLIGHT_TICK_MS = 1000 / 60;

export interface KillFeedPlayer {
  xuid: string;
  gamertag?: string;
  team?: number;
}

export interface KillFeedDamageDealer extends KillFeedPlayer {
  damagePercent?: number;
}

export interface KillFeedEntry {
  timeMs: number;
  killer?: KillFeedPlayer;
  killerDamagePercent?: number;
  victim?: KillFeedPlayer;
  damageAssists: KillFeedDamageDealer[];
}

interface ResolvedKillEvent {
  timeMs: number;
  killerIndex: number;
  victimIndex: number;
  assisterIndex?: number;
  killer: KillFeedPlayer;
  victim: KillFeedPlayer;
  assister?: KillFeedDamageDealer;
  killerDamagePercent?: number;
}

function hasRecipient(event: PlayerGameEvent, playerIndex: number): boolean {
  return (
    playerIndex >= 0 &&
    playerIndex < 32 &&
    Math.floor(event.recipientMask / 2 ** (31 - playerIndex)) % 2 === 1
  );
}

function learnAssistantEventType(
  kills: readonly PlayerKilledEvent[],
  gameEvents: readonly PlayerGameEvent[],
): number | undefined {
  const namedKills = kills.filter((event) => event.assisterIndex !== undefined);
  if (namedKills.length === 0) return undefined;

  const matchingKills = new Set<PlayerKilledEvent>();
  const types = new Set<number>();
  for (const kill of namedKills) {
    for (const event of gameEvents) {
      if (
        event.timeMs === kill.timeMs &&
        event.killerIndex === kill.killerIndex &&
        event.victimIndex === kill.victimIndex &&
        kill.assisterIndex !== undefined &&
        hasRecipient(event, kill.assisterIndex)
      ) {
        matchingKills.add(kill);
        types.add(event.type);
      }
    }
  }
  return matchingKills.size === namedKills.length && types.size === 1
    ? [...types][0]
    : undefined;
}

function recordedDamageContributors(
  victim: KillFeedPlayer,
  killer: KillFeedPlayer,
  timeMs: number,
  positions: Pick<LinkedFilmPositions, 'actors'> &
    Partial<Pick<LinkedFilmPositions, 'tracks'>>,
  damageEvents: readonly DamageEvent[],
): KillFeedPlayer[] {
  const victimActor = positions.actors.find(
    (actor) => actor.xuid === victim.xuid,
  );
  const life = victimActor?.lives
    .filter(
      (item) =>
        item.startMs <= timeMs &&
        item.endMs >= timeMs - 1500 &&
        item.endMs <= timeMs + 3000,
    )
    .sort((a, b) => Math.abs(a.endMs - timeMs) - Math.abs(b.endMs - timeMs))[0];
  if (!life) return [];

  let damageStartMs = life.startMs;
  const victimTrack = positions.tracks?.find(
    (track) => track.slot === life.slot,
  );
  let health: number | undefined;
  let shield: number | undefined;
  for (const sample of victimTrack?.samples ?? []) {
    if (sample.timeMs > timeMs) break;
    health = sample.health ?? health;
    shield = sample.shield ?? shield;
    if (
      health !== undefined &&
      shield !== undefined &&
      health >= 1 &&
      shield >= 1
    ) {
      damageStartMs = sample.timeMs;
    }
  }

  const contributors = new Map<string, KillFeedPlayer>();
  for (const damage of damageEvents) {
    if (
      damage.victimSlot !== life.slot ||
      damage.magnitude <= 0 ||
      damage.timeMs < damageStartMs ||
      damage.timeMs > timeMs ||
      damage.attackerSlot === undefined
    )
      continue;
    const actor = positions.actors.find(
      (candidate) =>
        candidate.xuid &&
        candidate.lives.some(
          (attackerLife) =>
            attackerLife.slot === damage.attackerSlot &&
            damage.timeMs >= attackerLife.startMs - 500 &&
            damage.timeMs <= attackerLife.endMs + 500,
        ),
    );
    if (
      !actor?.xuid ||
      actor.xuid === victim.xuid ||
      actor.xuid === killer.xuid ||
      (killer.team !== undefined && actor.team !== killer.team)
    )
      continue;
    contributors.set(actor.xuid, {
      xuid: actor.xuid,
      gamertag: actor.gamertag,
      team: actor.team,
    });
  }
  return [...contributors.values()];
}

export function buildKillFeed(
  events: readonly HighlightEvent[],
  positions: Pick<LinkedFilmPositions, 'actors' | 'highlightClockOffsetMs'> &
    Partial<Pick<LinkedFilmPositions, 'tracks'>>,
  damageEvents: readonly DamageEvent[],
  killEvents: readonly PlayerKilledEvent[] = [],
  roster: readonly FilmPlayer[] = [],
  gameEvents: readonly PlayerGameEvent[] = [],
): KillFeedEntry[] {
  const kills = events.filter((event) => event.type === 'kill');
  const deaths = events.filter((event) => event.type === 'death');
  const resolvedKillEvents: ResolvedKillEvent[] = [];
  const playerForXuid = (xuid: string, gamertag?: string): KillFeedPlayer => ({
    xuid,
    gamertag:
      gamertag ||
      positions.actors.find((actor) => actor.xuid === xuid)?.gamertag,
    team: positions.actors.find((actor) => actor.xuid === xuid)?.team,
  });
  const player = (event: HighlightEvent): KillFeedPlayer => {
    return playerForXuid(event.xuid, event.gamertag);
  };
  const rosterByIndex = new Map(
    roster.map((participant) => [participant.playerIndex, participant]),
  );
  const assistantType = learnAssistantEventType(killEvents, gameEvents);
  for (const event of killEvents) {
    const killer = rosterByIndex.get(event.killerIndex);
    const victim = rosterByIndex.get(event.victimIndex);
    if (!killer || !victim || killer.xuid === victim.xuid) continue;
    const assistant =
      event.assisterIndex === undefined
        ? undefined
        : rosterByIndex.get(event.assisterIndex);
    const assister =
      assistant &&
      assistant.xuid !== killer.xuid &&
      assistant.xuid !== victim.xuid
        ? {
            ...playerForXuid(assistant.xuid, assistant.gamertag),
            damagePercent: event.assisterDamagePercent,
          }
        : undefined;
    resolvedKillEvents.push({
      timeMs: event.timeMs,
      killerIndex: event.killerIndex,
      victimIndex: event.victimIndex,
      assisterIndex: event.assisterIndex,
      killer: playerForXuid(killer.xuid, killer.gamertag),
      victim: playerForXuid(victim.xuid, victim.gamertag),
      assister,
      killerDamagePercent: event.killerDamagePercent,
    });
  }
  const offset = positions.highlightClockOffsetMs ?? 0;
  const candidates = kills
    .flatMap((kill, killIndex) =>
      deaths.flatMap((death, deathIndex) => {
        const gap = Math.abs(kill.timeMs - death.timeMs);
        if (kill.xuid === death.xuid || gap > HIGHLIGHT_TICK_MS + 0.001)
          return [];
        const corroborated = resolvedKillEvents.some(
          (record) =>
            record.killer.xuid === kill.xuid &&
            record.victim.xuid === death.xuid &&
            Math.abs(record.timeMs - kill.timeMs - offset) <=
              KILL_EVENT_PAIR_WINDOW_MS &&
            Math.abs(record.timeMs - death.timeMs - offset) <=
              KILL_EVENT_PAIR_WINDOW_MS,
        );
        return gap <= 5 || corroborated
          ? [{ killIndex, deathIndex, gap, corroborated }]
          : [];
      }),
    )
    .sort(
      (a, b) =>
        Number(b.corroborated) - Number(a.corroborated) ||
        a.gap - b.gap ||
        a.killIndex - b.killIndex ||
        a.deathIndex - b.deathIndex,
    );
  const paired = new Map<number, number>();
  const usedDeaths = new Set<number>();
  for (const candidate of candidates) {
    if (paired.has(candidate.killIndex) || usedDeaths.has(candidate.deathIndex))
      continue;
    paired.set(candidate.killIndex, candidate.deathIndex);
    usedDeaths.add(candidate.deathIndex);
  }
  const exactByKillIndex = new Map<number, ResolvedKillEvent>();
  const usedExactEvents = new Set<ResolvedKillEvent>();
  for (const [killIndex, deathIndex] of paired) {
    const kill = kills[killIndex];
    const victim = deaths[deathIndex];
    const expectedTimeMs = kill.timeMs + offset;
    const candidates = resolvedKillEvents
      .filter(
        (record) =>
          !usedExactEvents.has(record) &&
          record.killer.xuid === kill.xuid &&
          record.victim.xuid === victim.xuid &&
          Math.abs(record.timeMs - expectedTimeMs) <= KILL_EVENT_PAIR_WINDOW_MS,
      )
      .sort(
        (a, b) =>
          Math.abs(a.timeMs - expectedTimeMs) -
          Math.abs(b.timeMs - expectedTimeMs),
      );
    const best = candidates[0];
    const next = candidates[1];
    if (
      best &&
      (!next ||
        Math.abs(best.timeMs - expectedTimeMs) <
          Math.abs(next.timeMs - expectedTimeMs))
    ) {
      exactByKillIndex.set(killIndex, best);
      usedExactEvents.add(best);
    }
  }
  const entry = (
    kill?: HighlightEvent,
    death?: HighlightEvent,
    exact?: ResolvedKillEvent,
  ): KillFeedEntry => {
    const replayTime = exact?.timeMs ?? ((death ?? kill)?.timeMs ?? 0) + offset;
    const killer = kill && player(kill);
    const victim = death && player(death);
    if (exact) {
      const damageAssists = new Map<string, KillFeedDamageDealer>();
      if (exact.assister) {
        damageAssists.set(exact.assister.xuid, exact.assister);
      }
      if (assistantType !== undefined) {
        const recipients = new Set<number>();
        for (const event of gameEvents) {
          if (
            event.timeMs !== exact.timeMs ||
            event.killerIndex !== exact.killerIndex ||
            event.victimIndex !== exact.victimIndex ||
            event.type !== assistantType
          )
            continue;
          for (let playerIndex = 0; playerIndex < 32; playerIndex++) {
            if (hasRecipient(event, playerIndex)) recipients.add(playerIndex);
          }
        }
        for (const playerIndex of recipients) {
          if (
            playerIndex === exact.killerIndex ||
            playerIndex === exact.victimIndex ||
            playerIndex === exact.assisterIndex
          )
            continue;
          const assistant = rosterByIndex.get(playerIndex);
          if (assistant) {
            damageAssists.set(
              assistant.xuid,
              playerForXuid(assistant.xuid, assistant.gamertag),
            );
          }
        }
      }
      for (const contributor of recordedDamageContributors(
        exact.victim,
        exact.killer,
        exact.timeMs,
        positions,
        damageEvents,
      )) {
        if (!damageAssists.has(contributor.xuid)) {
          damageAssists.set(contributor.xuid, contributor);
        }
      }
      return {
        timeMs: replayTime,
        killer: exact.killer,
        killerDamagePercent: exact.killerDamagePercent,
        victim: exact.victim,
        damageAssists: [...damageAssists.values()],
      };
    }
    const victimActor = positions.actors.find(
      (actor) => actor.xuid === victim?.xuid,
    );
    const life = victimActor?.lives
      .filter(
        (item) =>
          item.startMs <= replayTime &&
          item.endMs >= replayTime - 1500 &&
          item.endMs <= replayTime + 3000,
      )
      .sort(
        (a, b) =>
          Math.abs(a.endMs - replayTime) - Math.abs(b.endMs - replayTime),
      )[0];
    const damageByPlayer = new Map<
      string,
      { player: KillFeedPlayer; magnitude: number }
    >();
    if (life && killer) {
      for (const damage of damageEvents) {
        if (
          damage.victimSlot !== life.slot ||
          damage.magnitude <= 0 ||
          damage.timeMs < life.startMs ||
          damage.timeMs > replayTime ||
          damage.attackerSlot === undefined
        )
          continue;
        const actor = positions.actors.find(
          (candidate) =>
            candidate.xuid &&
            candidate.lives.some(
              (attackerLife) =>
                attackerLife.slot === damage.attackerSlot &&
                damage.timeMs >= attackerLife.startMs - 500 &&
                damage.timeMs <= attackerLife.endMs + 500,
            ),
        );
        if (
          !actor?.xuid ||
          actor.xuid === victim?.xuid ||
          (actor.xuid !== killer.xuid &&
            killer.team !== undefined &&
            actor.team !== killer.team)
        )
          continue;
        const gamertag =
          actor.gamertag ||
          events.find((event) => event.xuid === actor.xuid && event.gamertag)
            ?.gamertag;
        const previous = damageByPlayer.get(actor.xuid);
        damageByPlayer.set(actor.xuid, {
          player: { xuid: actor.xuid, gamertag, team: actor.team },
          magnitude: (previous?.magnitude ?? 0) + damage.magnitude,
        });
      }
    }
    return {
      timeMs: replayTime,
      killer,
      victim,
      damageAssists: [...damageByPlayer.values()]
        .filter((dealer) => dealer.player.xuid !== killer?.xuid)
        .map((dealer) => dealer.player),
    };
  };
  return [
    ...(kills.length === 0 && deaths.length === 0
      ? resolvedKillEvents.map((record) => entry(undefined, undefined, record))
      : []),
    ...kills.map((kill, index) =>
      entry(
        kill,
        paired.has(index) ? deaths[paired.get(index) ?? -1] : undefined,
        exactByKillIndex.get(index),
      ),
    ),
    ...deaths
      .filter((_, index) => !usedDeaths.has(index))
      .map((death) => entry(undefined, death)),
  ].sort((a, b) => a.timeMs - b.timeMs);
}

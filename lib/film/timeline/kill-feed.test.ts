import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  Actor,
  HighlightEvent,
  HighlightEventType,
} from '@gravllift/halo-helpers/film-types';
import { buildKillFeed } from './kill-feed';

const event = (
  type: HighlightEventType,
  xuid: string,
  timeMs: number,
): HighlightEvent => ({
  type,
  xuid,
  gamertag: xuid,
  timeMs,
  typeHint: 0,
  isMedal: false,
  medalType: 0,
});
const actor = (
  xuid: string,
  slot: number,
  team: number,
  endMs = 11000,
): Actor => ({
  actor: slot,
  xuid,
  gamertag: xuid,
  team,
  lives: [{ slot, startMs: 0, endMs, sampleCount: 1 }],
});

test('builds a provisional feed from gameplay kills before highlights arrive', () => {
  const entries = buildKillFeed(
    [],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1),
        actor('assist', 3, 0),
      ],
    },
    [],
    [
      {
        timeMs: 2000,
        killerIndex: 0,
        victimIndex: 1,
        assisterIndex: 2,
        killerDamagePercent: 70,
        assisterDamagePercent: 30,
      },
      {
        timeMs: 1000,
        killerIndex: 0,
        victimIndex: 1,
        killerDamagePercent: 100,
      },
      {
        timeMs: 3000,
        killerIndex: 0,
        victimIndex: 9,
        killerDamagePercent: 100,
      },
    ],
    [
      { playerIndex: 0, xuid: 'killer', gamertag: 'Killer' },
      { playerIndex: 1, xuid: 'victim', gamertag: 'Victim' },
      { playerIndex: 2, xuid: 'assist', gamertag: 'Assist' },
    ],
  );
  assert.deepEqual(
    entries.map((entry) => entry.timeMs),
    [1000, 2000],
  );
  assert.equal(entries[1].killer?.gamertag, 'Killer');
  assert.equal(entries[1].victim?.gamertag, 'Victim');
  assert.equal(entries[1].killerDamagePercent, 70);
  assert.deepEqual(entries[1].damageAssists, [
    { xuid: 'assist', gamertag: 'Assist', team: 0, damagePercent: 30 },
  ]);
});

test('reconciles gameplay kills with highlights without duplicating entries', () => {
  const kills = [
    { timeMs: 10500, killerIndex: 0, victimIndex: 1, killerDamagePercent: 100 },
  ];
  const roster = [
    { playerIndex: 0, xuid: 'killer', gamertag: 'Killer' },
    { playerIndex: 1, xuid: 'victim', gamertag: 'Victim' },
  ];
  const positions = {
    actors: [actor('killer', 1, 0), actor('victim', 2, 1)],
    highlightClockOffsetMs: 500,
  };
  const provisional = buildKillFeed([], positions, [], kills, roster);
  const final = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    positions,
    [],
    kills,
    roster,
  );
  assert.equal(provisional.length, 1);
  assert.equal(final.length, 1);
  assert.equal(final[0].timeMs, provisional[0].timeMs);
  assert.equal(final[0].killer?.xuid, provisional[0].killer?.xuid);
  assert.equal(final[0].victim?.xuid, provisional[0].victim?.xuid);
  assert.equal(final[0].killerDamagePercent, 100);
});

test('preserves a gameplay kill when its highlights differ by one game tick', () => {
  const positions = {
    actors: [
      actor('killer', 1, 1, 50000),
      actor('victim', 2, 0, 50000),
      actor('assist', 3, 1, 50000),
    ],
  };
  const kills = [
    {
      timeMs: 48700,
      killerIndex: 0,
      victimIndex: 1,
      assisterIndex: 2,
      killerDamagePercent: 23,
      assisterDamagePercent: 76,
    },
  ];
  const roster = [
    { playerIndex: 0, xuid: 'killer', gamertag: 'SwltchbIxde' },
    { playerIndex: 1, xuid: 'victim', gamertag: 'buterymufin' },
    { playerIndex: 2, xuid: 'assist', gamertag: 'xSTAITISx' },
  ];
  const provisional = buildKillFeed([], positions, [], kills, roster);
  const final = buildKillFeed(
    [
      event('kill', 'killer', 48700),
      event('death', 'victim', 48716.666666666664),
    ],
    positions,
    [],
    kills,
    roster,
  );
  assert.deepEqual(final, provisional);
  assert.equal(final.length, 1);
  assert.equal(final[0].killerDamagePercent, 23);
  assert.equal(final[0].damageAssists[0].damagePercent, 76);
});

test('prefers confirmed pairs over closer highlights from simultaneous kills', () => {
  const entries = buildKillFeed(
    [
      event('kill', 'first', 1000),
      event('kill', 'second', 1016.6666666666666),
      event('death', 'second-victim', 1000),
      event('death', 'first-victim', 1016.6666666666666),
    ],
    { actors: [] },
    [],
    [
      { timeMs: 1000, killerIndex: 0, victimIndex: 2, killerDamagePercent: 23 },
      {
        timeMs: 1016.6666666666666,
        killerIndex: 1,
        victimIndex: 3,
        killerDamagePercent: 90,
      },
    ],
    [
      { playerIndex: 0, xuid: 'first' },
      { playerIndex: 1, xuid: 'second' },
      { playerIndex: 2, xuid: 'first-victim' },
      { playerIndex: 3, xuid: 'second-victim' },
    ],
  );
  assert.deepEqual(
    entries.map((entry) => [
      entry.killer?.xuid,
      entry.victim?.xuid,
      entry.killerDamagePercent,
    ]),
    [
      ['first', 'first-victim', 23],
      ['second', 'second-victim', 90],
    ],
  );
});

test('does not pair a one-tick difference without a confirming gameplay kill', () => {
  const entries = buildKillFeed(
    [
      event('kill', 'killer', 1000),
      event('death', 'victim', 1016.6666666666666),
    ],
    { actors: [] },
    [],
  );
  assert.equal(entries.length, 2);
  assert.equal(entries[0].victim, undefined);
  assert.equal(entries[1].killer, undefined);
});

test('pairs the closest highlights without reusing deaths and retains unmatched events', () => {
  const entries = buildKillFeed(
    [
      event('kill', 'a', 1002),
      event('kill', 'b', 1000),
      event('death', 'c', 1000),
      event('death', 'd', 1002),
      event('death', 'e', 2000),
      event('kill', 'f', 3000),
    ],
    { actors: [], highlightClockOffsetMs: 500 },
    [],
  );
  assert.deepEqual(
    entries.map((entry) => [
      entry.timeMs,
      entry.killer?.xuid,
      entry.victim?.xuid,
    ]),
    [
      [1500, 'b', 'c'],
      [1502, 'a', 'd'],
      [2500, undefined, 'e'],
      [3500, 'f', undefined],
    ],
  );
});

test('lists damage contributors without inventing their percentage shares', () => {
  const entries = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1, 10500),
        actor('assist', 3, 0),
        actor('enemy', 4, 1),
      ],
      highlightClockOffsetMs: 500,
    },
    [
      { timeMs: 9000, victimSlot: 2, attackerSlot: 3, magnitude: 1 },
      { timeMs: 9500, victimSlot: 2, attackerSlot: 3, magnitude: 1 },
      { timeMs: 9900, victimSlot: 2, attackerSlot: 4, magnitude: 1 },
      { timeMs: 10000, victimSlot: 2, attackerSlot: 1, magnitude: 1 },
      { timeMs: 10100, victimSlot: 2, attackerSlot: 4, magnitude: -1 },
      { timeMs: 10600, victimSlot: 2, attackerSlot: 4, magnitude: 1 },
    ],
  );
  assert.equal(entries[0].timeMs, 10500);
  assert.deepEqual(
    entries[0].damageAssists.map((player) => player.xuid),
    ['assist'],
  );
  assert.equal(entries[0].killerDamagePercent, undefined);
  assert.equal(entries[0].damageAssists[0].damagePercent, undefined);
});

test('leaves all damage percentages unknown when no killer damage was recorded', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1, 10000),
        actor('assist', 3, 0),
      ],
    },
    [{ timeMs: 9000, victimSlot: 2, attackerSlot: 3, magnitude: 2 }],
  );
  assert.equal(entry.killerDamagePercent, undefined);
  assert.equal(entry.damageAssists[0].damagePercent, undefined);
});

test('does not infer damage percentages from partial damage logs', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1, 10000),
        actor('assist', 3, 0),
      ],
    },
    [
      { timeMs: 9000, victimSlot: 2, attackerSlot: 1, magnitude: 0.001 },
      { timeMs: 9000, victimSlot: 2, attackerSlot: 3, magnitude: 10 },
    ],
  );
  assert.equal(entry.killerDamagePercent, undefined);
  assert.equal(entry.damageAssists[0].damagePercent, undefined);
});

test('shares recorded damage among the killer and multiple contributors', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1, 10000),
        actor('first', 3, 0),
        actor('second', 4, 0),
      ],
    },
    [
      { timeMs: 9000, victimSlot: 2, attackerSlot: 1, magnitude: 5 },
      { timeMs: 9000, victimSlot: 2, attackerSlot: 3, magnitude: 3 },
      { timeMs: 9000, victimSlot: 2, attackerSlot: 4, magnitude: 2 },
    ],
  );
  assert.equal(entry.killerDamagePercent, undefined);
  assert.deepEqual(
    entry.damageAssists.map((player) => player.xuid),
    ['first', 'second'],
  );
});

test('uses exact event shares and ignores damage before the latest full vitality reset', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1),
        actor('assist', 3, 0),
        actor('other', 4, 0),
        actor('stale', 5, 0),
      ],
      highlightClockOffsetMs: 500,
      tracks: [
        {
          slot: 2,
          samples: [
            {
              timeMs: 0,
              health: 0.6,
              shield: 0,
              q: [1, 1, 1],
              normalized: [0, 0, 0],
            },
            {
              timeMs: 8000,
              health: 1,
              shield: 1,
              q: [1, 1, 1],
              normalized: [0, 0, 0],
            },
          ],
        },
      ],
    },
    [
      { timeMs: 5000, victimSlot: 2, attackerSlot: 5, magnitude: 20 },
      { timeMs: 9000, victimSlot: 2, attackerSlot: 4, magnitude: 2 },
    ],
    [
      {
        timeMs: 10500,
        killerIndex: 0,
        victimIndex: 1,
        assisterIndex: 2,
        killerDamagePercent: 61,
        assisterDamagePercent: 39,
      },
    ],
    [
      { playerIndex: 0, xuid: 'killer', gamertag: 'killer' },
      { playerIndex: 1, xuid: 'victim', gamertag: 'victim' },
      { playerIndex: 2, xuid: 'assist', gamertag: 'assist' },
    ],
  );
  assert.equal(entry.timeMs, 10500);
  assert.equal(entry.killerDamagePercent, 61);
  assert.deepEqual(entry.damageAssists, [
    { xuid: 'assist', gamertag: 'assist', team: 0, damagePercent: 39 },
    { xuid: 'other', gamertag: 'other', team: 0 },
  ]);
});

test('does not assign a share to an additional damage contributor', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1),
        actor('assist', 3, 0),
        actor('other', 4, 0),
      ],
      highlightClockOffsetMs: 500,
    },
    [{ timeMs: 9000, victimSlot: 2, attackerSlot: 4, magnitude: 2 }],
    [
      {
        timeMs: 10500,
        killerIndex: 0,
        victimIndex: 1,
        assisterIndex: 2,
        killerDamagePercent: 8,
        assisterDamagePercent: 30,
      },
    ],
    [
      { playerIndex: 0, xuid: 'killer', gamertag: 'killer' },
      { playerIndex: 1, xuid: 'victim', gamertag: 'victim' },
      { playerIndex: 2, xuid: 'assist', gamertag: 'assist' },
    ],
  );
  assert.deepEqual(entry.damageAssists, [
    { xuid: 'assist', gamertag: 'assist', team: 0, damagePercent: 30 },
    { xuid: 'other', gamertag: 'other', team: 0 },
  ]);
});

test('reads extra assistants from the film-learned PlayerGameEvent type', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    {
      actors: [
        actor('killer', 1, 0),
        actor('victim', 2, 1),
        actor('assist', 3, 0),
        actor('extra', 4, 0),
      ],
      highlightClockOffsetMs: 500,
    },
    [],
    [
      {
        timeMs: 10500,
        killerIndex: 0,
        victimIndex: 1,
        assisterIndex: 2,
        killerDamagePercent: 8,
        assisterDamagePercent: 30,
      },
    ],
    [
      { playerIndex: 0, xuid: 'killer', gamertag: 'killer' },
      { playerIndex: 1, xuid: 'victim', gamertag: 'victim' },
      { playerIndex: 2, xuid: 'assist', gamertag: 'assist' },
      { playerIndex: 3, xuid: 'extra', gamertag: 'extra' },
    ],
    [
      {
        timeMs: 10500,
        type: 70,
        killerIndex: 0,
        victimIndex: 1,
        recipientMask: 2 ** 29,
      },
      {
        timeMs: 10500,
        type: 70,
        killerIndex: 0,
        victimIndex: 1,
        recipientMask: 2 ** 28,
      },
    ],
  );
  assert.deepEqual(entry.damageAssists, [
    { xuid: 'assist', gamertag: 'assist', team: 0, damagePercent: 30 },
    { xuid: 'extra', gamertag: 'extra', team: 0 },
  ]);
});

test('does not expose the per-film assistant-share constant when no assister is recorded', () => {
  const [entry] = buildKillFeed(
    [event('kill', 'killer', 10000), event('death', 'victim', 10000)],
    { actors: [actor('killer', 1, 0), actor('victim', 2, 1)] },
    [],
    [
      {
        timeMs: 10000,
        killerIndex: 0,
        victimIndex: 1,
        killerDamagePercent: 100,
        assisterDamagePercent: 149,
      },
    ],
    [
      { playerIndex: 0, xuid: 'killer', gamertag: 'killer' },
      { playerIndex: 1, xuid: 'victim', gamertag: 'victim' },
    ],
  );
  assert.equal(entry.killerDamagePercent, 100);
  assert.deepEqual(entry.damageAssists, []);
});

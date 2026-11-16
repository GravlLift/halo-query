import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildScoreTimeline,
  isRoundBased,
  roundScoreAt,
  roundsWonAt,
} from './score';
import type { StatRecord } from '../../../../../libs/halo-film/src/decoders/stat-records';

const record = (
  slot: number,
  round: number,
  timeMs: number,
  score?: number,
): StatRecord => ({
  slot,
  round,
  timeMs,
  comps: new Map(score === undefined ? [] : [[0, { a: score, b: 0 }]]),
});

/** Slot 6 scores 1..4 then slot 8 scores 1..3 in round 0; slot 8 takes round 1 as well. */
const ticks = (slot: number, round: number, from: number, count: number) =>
  Array.from({ length: count }, (_, i) =>
    record(slot, round, from + i * 1000, i + 1),
  );
const players = (round: number, from: number) =>
  Array.from({ length: 30 }, (_, i) => record(10, round, from + i));

const records = [
  ...ticks(6, 0, 1000, 4),
  ...ticks(8, 0, 2000, 3),
  ...players(0, 100),
  ...ticks(8, 1, 20000, 5),
  ...ticks(6, 1, 21000, 2),
  ...players(1, 15000),
];

describe('round scores', () => {
  const timeline = buildScoreTimeline(records);
  const [a, b] = timeline.teams;

  it('detects a game played in rounds', () => {
    assert.equal(isRoundBased(timeline), true);
    assert.equal(timeline.rounds.length, 2);
  });

  it('ends a round at its winner\u2019s last point and starts the next at the reset', () => {
    assert.equal(timeline.rounds[0].winnerSlot, 6);
    assert.equal(timeline.rounds[0].endMs, 4000);
    assert.equal(timeline.rounds[1].startMs, 15000);
    assert.equal(timeline.rounds[1].winnerSlot, 8);
  });

  it('restarts the round score at the reset but keeps the total', () => {
    assert.equal(roundScoreAt(timeline, a, 4500), 4);
    assert.equal(roundScoreAt(timeline, a, 16000), 0);
    assert.equal(roundScoreAt(timeline, b, 22000), 3);
  });

  it('awards a round win when the round is decided', () => {
    assert.equal(roundsWonAt(timeline, a, 3999), 0);
    assert.equal(roundsWonAt(timeline, a, 4000), 1);
    assert.equal(roundsWonAt(timeline, b, 30000), 1);
  });

  it('is not round based with a single round', () => {
    const single = buildScoreTimeline(records.filter((r) => r.round === 0));
    assert.equal(isRoundBased(single), false);
  });

  it('does not treat overtime after a level game as a second round', () => {
    const overtime = buildScoreTimeline([
      ...ticks(6, 0, 1000, 1),
      ...ticks(8, 0, 2000, 1),
      ...players(0, 100),
      ...ticks(6, 1, 20000, 1),
      ...players(1, 15000),
    ]);
    assert.equal(overtime.rounds.length, 2);
    assert.equal(isRoundBased(overtime), false);
  });
});

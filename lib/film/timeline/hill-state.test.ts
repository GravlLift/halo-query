import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHillTimeline, type HillInput } from './hill-state';

const ticks = (team: number, times: number[]) => ({
  team,
  points: times.map((timeMs, i) => ({ timeMs, seconds: i + 1 })),
});

const input: HillInput = {
  hills: [
    { team: -1, x: 0.2, y: 0.2, radius: 0.05 },
    { team: -1, x: 0.8, y: 0.8, radius: 0.05 },
  ],
  control: [ticks(0, [1000, 2000, 3000, 4000]), ticks(1, [12000, 13000])],
  scores: [{ timeMs: 4000, team: 0 }],
};

const at = (t: number) =>
  t < 6000 ? [{ x: 0.2, y: 0.2, team: 0 }] : [{ x: 0.8, y: 0.8, team: 1 }];

describe('buildHillTimeline', () => {
  const timeline = buildHillTimeline(input, at, 20000);

  it('learns the seconds a point takes from the scoring team', () => {
    assert.equal(timeline.secondsPerPoint, 4);
  });

  it('advances the controlling team on the active hill', () => {
    const state = timeline.at(2500);
    assert.equal(state.activeHill, 0);
    assert.equal(state.controllingTeam, 0);
    const mine = state.progress.find((p) => p.team === 0);
    assert.ok(Math.abs((mine?.progress ?? 0) - 0.625) < 1e-9);
  });

  it('resets both teams when a point is scored and waits for the next hill', () => {
    const state = timeline.at(5000);
    assert.deepEqual(
      state.progress.map((p) => p.progress),
      [0, 0],
    );
    assert.equal(state.activeHill, undefined);
  });

  it('moves to the hill the next controller stands in, and keeps progress when they leave', () => {
    const during = timeline.at(12500);
    assert.equal(during.activeHill, 1);
    assert.equal(during.controllingTeam, 1);
    const banked = timeline.at(16000);
    assert.equal(banked.controllingTeam, undefined);
    assert.equal(banked.progress.find((p) => p.team === 1)?.progress, 0.5);
  });
});

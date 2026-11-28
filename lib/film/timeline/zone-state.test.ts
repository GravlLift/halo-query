import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildZoneTimeline, type ZoneShape } from './zone-state';

const zones: ZoneShape[] = [
  { team: 0, x: 0.2, y: 0.2, radius: 0.05 },
  { team: -1, x: 0.8, y: 0.8, radius: 0.05 },
];

describe('buildZoneTimeline', () => {
  it('fills while one enemy stands in, pauses on leaving, and resets for a new team', () => {
    const at = (t: number) =>
      t < 4000
        ? [{ x: 0.8, y: 0.8, team: 1 }]
        : t < 8000
          ? []
          : t < 10000
            ? [{ x: 0.8, y: 0.8, team: 0 }]
            : [];
    const timeline = buildZoneTimeline(zones, [], at, 12000);
    const early = timeline.at(2000)[1];
    assert.equal(early.capturingTeam, 1);
    assert.ok(early.progress > 0);
    const paused = timeline.at(6000)[1];
    assert.equal(paused.progress, timeline.at(4000)[1].progress);
    const reset = timeline.at(8500)[1];
    assert.equal(reset.capturingTeam, 0);
    assert.ok(reset.progress < paused.progress);
  });

  it('resets an attacker’s progress when the game reports a secure', () => {
    const at = (t: number) =>
      t < 3000 ? [{ x: 0.2, y: 0.2, team: 1 }] : [{ x: 0.2, y: 0.2, team: 0 }];
    const timeline = buildZoneTimeline(zones, [], at, 6000, [
      { timeMs: 3500, team: 0 },
    ]);
    assert.ok(timeline.at(2500)[0].progress > 0);
    assert.ok(timeline.at(3250)[0].progress > 0);
    const after = timeline.at(4000)[0];
    assert.equal(after.progress, 0);
    assert.equal(after.capturingTeam, undefined);
  });

  it('gives a capture to the zone the capturing team stands in', () => {
    const at = () => [{ x: 0.8, y: 0.8, team: 1 }];
    const timeline = buildZoneTimeline(
      zones,
      [{ timeMs: 5000, team: 1 }],
      at,
      8000,
    );
    assert.equal(timeline.at(4000)[1].owner, -1);
    assert.equal(timeline.at(6000)[1].owner, 1);
    assert.equal(timeline.at(6000)[1].progress, 0);
    assert.equal(timeline.at(6000)[0].owner, 0);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFlagSegments, findGrabs, type FlagObject } from './flag-objects';

const flag: FlagObject = {
  kind: 'flag',
  team: 1,
  homeX: 0.5,
  homeY: 0.5,
  resets: [0, 20000],
  drops: [
    { timeMs: 5000, path: [{ timeMs: 5000, x: 0.1, y: 0.1 }] },
    { timeMs: 12000, path: [] },
  ],
};

describe('buildFlagSegments', () => {
  it('follows the flag through grabs, drops and resets', () => {
    const segments = buildFlagSegments(
      flag,
      [
        { carrier: 3, timeMs: 2000 },
        { carrier: 4, timeMs: 9000 },
      ],
      30000,
    );
    assert.deepEqual(
      segments.map((s) => [s.state, s.fromMs, s.toMs, s.carrier]),
      [
        ['home', 0, 2000, undefined],
        ['carried', 2000, 5000, 3],
        ['dropped', 5000, 9000, undefined],
        ['carried', 9000, 12000, 4],
        ['dropped', 12000, 20000, undefined],
        ['home', 20000, 30000, undefined],
      ],
    );
  });

  it('ends a carry at the next reset even without a drop', () => {
    const segments = buildFlagSegments(
      { ...flag, drops: [] },
      [{ carrier: 3, timeMs: 2000 }],
      30000,
    );
    assert.deepEqual(
      segments.map((s) => [s.state, s.fromMs, s.toMs]),
      [
        ['home', 0, 2000],
        ['carried', 2000, 20000],
        ['home', 20000, 30000],
      ],
    );
  });
});

describe('findGrabs', () => {
  const skull: FlagObject = {
    kind: 'skull',
    team: -1,
    homeX: 0.5,
    homeY: 0.5,
    resets: [0],
    drops: [{ timeMs: 5000, path: [{ timeMs: 5015, x: 0.2, y: 0.2 }] }],
  };

  it('takes the first nearby event of each free interval', () => {
    const grabs = findGrabs(
      skull,
      [
        { carrier: 1, timeMs: 1000, x: 0.9, y: 0.9 },
        { carrier: 2, timeMs: 1200, x: 0.5, y: 0.51 },
        { carrier: 2, timeMs: 5000, x: 0.2, y: 0.2 },
        { carrier: 3, timeMs: 7000, x: 0.2, y: 0.21 },
      ],
      0.05,
    );
    assert.deepEqual(grabs, [
      { carrier: 2, timeMs: 1200 },
      { carrier: 3, timeMs: 7000 },
    ]);
  });

  it('ignores the owning team of a flag', () => {
    const grabs = findGrabs(
      { ...skull, kind: 'flag', team: 1 },
      [{ carrier: 1, team: 1, timeMs: 1000, x: 0.5, y: 0.5 }],
      0.05,
    );
    assert.deepEqual(grabs, []);
  });
});

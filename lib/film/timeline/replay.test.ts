import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LinkedFilmPositions } from '@gravllift/halo-helpers/film-types';
import { createReplay } from './replay';

describe('replay loadout', () => {
  it('keeps both team flags visible as one flag changes possession', () => {
    const positions: LinkedFilmPositions = {
      layout: { gateBits: 0, axisBits: [1, 1, 1] },
      flipRates: [],
      actors: [
        {
          actor: 0,
          lives: [{ slot: 512, startMs: 0, endMs: 10000, sampleCount: 2 }],
        },
      ],
      tracks: [
        {
          slot: 512,
          samples: [
            { timeMs: 0, q: [0, 0, 0], normalized: [0.5, 0.5, 0] },
            { timeMs: 10000, q: [0, 0, 0], normalized: [0.5, 0.5, 0] },
          ],
        },
      ],
    };
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [],
      [],
      [],
      {
        timeline: [
          { timeMs: 0, kind: 'flag', team: 0, state: 'home', x: 0.1, y: 0.2 },
          { timeMs: 0, kind: 'flag', team: 1, state: 'home', x: 0.8, y: 0.9 },
          { timeMs: 1000, kind: 'flag', team: 1, state: 'carried', actor: 0 },
        ],
      },
      10000,
    );
    assert.equal(replay.objectives(500).length, 2);
    assert.equal(replay.objectives(1500).length, 2);
    assert.equal(
      replay.objectives(1500).find((flag) => flag.team === 0)?.state,
      'home',
    );
    assert.equal(
      replay.objectives(1500).find((flag) => flag.team === 1)?.actor,
      0,
    );
  });

  it('keeps known inventory state even before a weapon is identified', () => {
    const positions: LinkedFilmPositions = {
      layout: { gateBits: 0, axisBits: [1, 1, 1] },
      flipRates: [],
      tracks: [],
      actors: [
        {
          actor: 0,
          lives: [{ slot: 512, startMs: 0, endMs: 10000, sampleCount: 0 }],
        },
      ],
    };
    const replay = createReplay(positions, undefined, undefined, [
      {
        timeMs: 1000,
        slot: 512,
        weapons: [],
        ammo: [{ mag: 17, reserve: 34, flags: 0, overheat: 0 }],
        grenades: [1, 0, 0, 0],
      },
    ]);
    assert.equal(replay.loadout(0, 2000)?.mag, 17);
    assert.equal(replay.loadout(0, 2000)?.reserve, 34);
    assert.equal(replay.loadout(0, 2000)?.grenades[0]?.count, 1);
    assert.equal(replay.loadout(0, 2000)?.weapon, undefined);
  });

  it('preserves facing separately from later aim updates', () => {
    const sample = (
      timeMs: number,
      facingYawDeg?: number,
      aimYawDeg?: number,
    ) => {
      const q: [number, number, number] = [1000, 2000, 1200];
      const normalized: [number, number, number] = [0.25, 0.5, 0.6];
      return { timeMs, q, normalized, facingYawDeg, aimYawDeg };
    };
    const replay = createReplay({
      layout: { gateBits: 6, axisBits: [12, 12, 11] },
      flipRates: [],
      tracks: [
        {
          slot: 512,
          samples: [
            sample(10000, 45),
            sample(30000),
            sample(31000, undefined, 70),
          ],
        },
      ],
      actors: [
        {
          actor: 0,
          lives: [{ slot: 512, startMs: 10000, endMs: 31000, sampleCount: 3 }],
        },
      ],
    });
    assert.equal(replay.at(20000)[0].facingYawDeg, 45);
    assert.equal(replay.at(20000)[0].aimYawDeg, undefined);
    assert.equal(replay.at(31000)[0].aimYawDeg, 70);
  });

  it('uses only events after the latest keyframe, including events at the requested time', () => {
    const positions: LinkedFilmPositions = {
      layout: { gateBits: 0, axisBits: [1, 1, 1] },
      flipRates: [],
      tracks: [],
      actors: [
        {
          actor: 0,
          lives: [{ slot: 512, startMs: 0, endMs: 10000, sampleCount: 0 }],
        },
      ],
    };
    const br = 0x2b1824d5;
    const sidekick = 0xf408190f;
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [
        { timeMs: 1000, slot: 512, weapons: [br, sidekick] },
        { timeMs: 5000, slot: 512, weapons: [br, sidekick] },
      ],
      [
        { timeMs: 5000, slot: 512, family: sidekick, weapon: 'Mk51 Sidekick' },
        { timeMs: 6000, slot: 512, family: sidekick, weapon: 'Mk51 Sidekick' },
      ],
      [],
      {},
      10000,
      undefined,
      undefined,
      [
        { timeMs: 4000, slot: 512, weapons: [{ weaponSlot: 0, mag: 4 }] },
        { timeMs: 5000, slot: 512, weapons: [{ weaponSlot: 0, mag: 3 }] },
        { timeMs: 6000, slot: 512, weapons: [{ weaponSlot: 1, mag: 7 }] },
      ],
    );

    assert.equal(replay.loadout(0, 4000)?.mag, 4);
    assert.equal(replay.loadout(0, 5000)?.weapon, 'BR75');
    assert.equal(replay.loadout(0, 5000)?.mag, undefined);
    assert.equal(replay.loadout(0, 6000)?.weapon, 'Mk51 Sidekick');
    assert.equal(replay.loadout(0, 6000)?.mag, 7);
    assert.equal(replay.loadout(0, 4999)?.mag, 4);
  });

  it('does not report one weapon in both slots and samples aim at fire time', () => {
    const br = 0x2b1824d5;
    const positions: LinkedFilmPositions = {
      layout: { gateBits: 0, axisBits: [1, 1, 1] },
      flipRates: [],
      tracks: [
        {
          slot: 512,
          samples: [
            {
              timeMs: 0,
              q: [0, 0, 0],
              normalized: [0.2, 0.3, 0],
              aimYawDeg: 35,
            },
            {
              timeMs: 1000,
              q: [0, 0, 0],
              normalized: [0.3, 0.4, 0],
              aimYawDeg: 80,
            },
          ],
        },
      ],
      actors: [
        {
          actor: 0,
          lives: [{ slot: 512, startMs: 0, endMs: 1000, sampleCount: 2 }],
        },
      ],
    };
    const replay = createReplay(
      positions,
      undefined,
      undefined,
      [{ timeMs: 0, slot: 512, weapons: [br, br], drawnSlot: 0 }],
      [{ timeMs: 500, slot: 512, family: br, weapon: 'BR75' }],
      [{ timeMs: 600, attackerSlot: 512, victimSlot: 513, magnitude: 5 }],
      {},
      1000,
    );

    assert.equal(replay.loadout(0, 700)?.weapon, 'BR75');
    assert.equal(replay.loadout(0, 700)?.holstered, undefined);
    assert.deepEqual(replay.fires(0, 0, 500), [
      { timeMs: 500, weapon: 'BR75', aimYawDeg: 35 },
    ]);
  });
});

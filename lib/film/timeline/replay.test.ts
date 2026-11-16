import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LinkedFilmPositions } from '../../../../../libs/halo-film/src/decoders/positions';
import { createReplay } from './replay';

describe('replay loadout', () => {
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
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as native from '@gravllift/halo-film-ui';
import * as upstream from 'films-ui';

type RenderingFunctions =
  | 'drawZones'
  | 'drawFloor'
  | 'floorHeights'
  | 'floorPath'
  | 'floorBands'
  | 'ringsAt'
  | 'loadImage'
  | 'paintIcon'
  | 'loadMarkers'
  | 'markerImage'
  | 'loadTeamEmblems'
  | 'teamEmblem'
  | 'setTeamColor';
const nativeContract: Pick<typeof upstream, RenderingFunctions> = native;
const upstreamContract: Pick<typeof native, RenderingFunctions> = upstream;

describe('independent map renderer compatibility', () => {
  it('accepts either implementation through the same rendering contract', () => {
    const sharedFunctions: RenderingFunctions[] = [
      'drawZones',
      'drawFloor',
      'floorHeights',
      'floorPath',
      'floorBands',
      'ringsAt',
      'loadImage',
      'paintIcon',
      'loadMarkers',
      'markerImage',
      'loadTeamEmblems',
      'teamEmblem',
      'setTeamColor',
    ];
    for (const key of sharedFunctions) {
      assert.equal(
        typeof Reflect.get(upstreamContract, key),
        typeof Reflect.get(nativeContract, key),
      );
    }
  });

  it('allows native replay layers beyond the common rendering contract', () => {
    const zoneRenderers: native.MapRenderer[] = [native, upstream];
    assert.equal(zoneRenderers.length, 2);
    for (const layer of [
      native.drawReplay,
      native.drawPlayers,
      native.drawProjectiles,
      native.drawObjectives,
      native.drawHillProgress,
      native.drawRoundScores,
    ])
      assert.equal(typeof layer, 'function');
  });

  for (const module of ['zones', 'floor', 'markers', 'teamEmblems', 'tokens']) {
    it(`matches ${module} exports without forwarding implementations`, async () => {
      const first = await import(`@gravllift/halo-film-ui/${module}`);
      const second = await import(`films-ui/${module}`);
      assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort());
      for (const key of Object.keys(first)) {
        assert.equal(typeof first[key], typeof second[key]);
        if (typeof first[key] === 'function')
          assert.notEqual(first[key], second[key]);
        else assert.deepEqual(first[key], second[key]);
      }
    });
  }

  it('keeps renderer palettes isolated', () => {
    const original = upstream.TEAM[0];
    try {
      native.setTeamColor(0, '#123456');
      assert.equal(native.TEAM[0], '#123456');
      assert.equal(upstream.TEAM[0], original);
      assert.notEqual(native.TEAM, upstream.TEAM);
    } finally {
      native.setTeamColor(0, null);
    }
  });
});

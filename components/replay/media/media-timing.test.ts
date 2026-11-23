import {
  initialOffsetSec,
  parseMediaInfoDate,
  planCorrection,
  recordingStartMs,
  targetMediaTime,
} from './media-timing';

describe('recordingStartMs', () => {
  it('prefers the embedded date', () => {
    expect(
      recordingStartMs({
        encodedMs: 1000,
        lastModifiedMs: 50000,
        durationSec: 10,
      }),
    ).toBe(1000);
  });

  it('works backwards from lastModified', () => {
    expect(
      recordingStartMs({
        encodedMs: undefined,
        lastModifiedMs: 50000,
        durationSec: 10,
      }),
    ).toBe(40000);
  });
});

describe('initialOffsetSec', () => {
  const base = {
    matchStartMs: 100_000,
    matchDurationMs: 60_000,
    currentReplayMs: 5_000,
  };

  it('aligns a recording that started before the match', () => {
    const offset = initialOffsetSec({
      ...base,
      mediaStartMs: 90_000,
      durationSec: 120,
    });
    expect(offset).toBe(10);
    expect(targetMediaTime(5_000, offset)).toBe(15);
  });

  it('aligns a recording that started after the match', () => {
    expect(
      initialOffsetSec({ ...base, mediaStartMs: 110_000, durationSec: 120 }),
    ).toBe(-10);
  });

  it('starts at 0:00 at the current position when there is no overlap', () => {
    const offset = initialOffsetSec({
      ...base,
      mediaStartMs: 500_000,
      durationSec: 30,
    });
    expect(targetMediaTime(5_000, offset)).toBe(0);
  });
});

describe('planCorrection', () => {
  const plan = (
    currentSec: number,
    targetSec: number,
    playing: boolean,
    speed = 1,
    currentRate = speed,
  ) => planCorrection({ currentSec, targetSec, speed, playing, currentRate });

  it('seeks precisely while paused', () => {
    expect(plan(10, 10.1, false)).toEqual({ rate: 1 });
    expect(plan(10, 10.2, false)).toEqual({ seekTo: 10.2, rate: 1 });
  });

  it('starts a fixed rate nudge only once drift is noticeable', () => {
    expect(plan(10, 10.08, true)).toEqual({ rate: 1 });
    expect(plan(10, 10.5, true)).toEqual({ rate: 1.05 });
    expect(plan(10, 9.5, true)).toEqual({ rate: 0.95 });
  });

  it('holds the nudge until drift is nearly gone', () => {
    expect(plan(10, 10.05, true, 1, 1.05)).toEqual({ rate: 1.05 });
    expect(plan(10, 10.01, true, 1, 1.05)).toEqual({ rate: 1 });
    expect(plan(10, 9.95, true, 1, 1.05)).toEqual({ rate: 1 });
  });

  it('does not mistake a speed change for a correction', () => {
    expect(plan(10, 10.05, true, 2, 1)).toEqual({ rate: 2 });
  });

  it('clamps to browser rate limits', () => {
    expect(plan(10, 10.5, true, 16)).toEqual({ rate: 16 });
  });

  it('hard-seeks large drift while playing, scaled by speed', () => {
    expect(plan(10, 12, true)).toEqual({ seekTo: 12, rate: 1 });
    expect(plan(10, 12, true, 4).seekTo).toBeUndefined();
  });
});

describe('parseMediaInfoDate', () => {
  it('parses UTC suffix and prefix formats', () => {
    const expected = Date.UTC(2024, 0, 2, 3, 4, 5);
    expect(parseMediaInfoDate('2024-01-02 03:04:05 UTC')).toBe(expected);
    expect(parseMediaInfoDate('UTC 2024-01-02 03:04:05')).toBe(expected);
    expect(parseMediaInfoDate('2024-01-02T03:04:05Z')).toBe(expected);
  });

  it('rejects missing or malformed values', () => {
    expect(parseMediaInfoDate(undefined)).toBeUndefined();
    expect(parseMediaInfoDate('unknown')).toBeUndefined();
  });
});

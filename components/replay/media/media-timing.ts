export const DRIFT_THRESHOLD_SEC = 0.15;

/** When the recording began, in epoch milliseconds. */
export function recordingStartMs({
  encodedMs,
  lastModifiedMs,
  durationSec,
}: {
  encodedMs: number | undefined;
  lastModifiedMs: number;
  durationSec: number;
}) {
  // lastModified is when the recorder finished writing the file.
  return encodedMs ?? lastModifiedMs - durationSec * 1000;
}

/** Offset aligning wall-clock media to the match, or undefined when they don't overlap. */
export function overlapOffsetSec({
  mediaStartMs,
  durationSec,
  matchStartMs,
  matchDurationMs,
}: {
  mediaStartMs: number;
  durationSec: number;
  matchStartMs: number;
  matchDurationMs: number;
}) {
  const mediaEndMs = mediaStartMs + durationSec * 1000;
  const matchEndMs = matchStartMs + matchDurationMs;
  return mediaStartMs < matchEndMs && mediaEndMs > matchStartMs
    ? (matchStartMs - mediaStartMs) / 1000
    : undefined;
}

/** Offset in seconds such that `mediaTime = replayMs / 1000 + offset`. */
export function initialOffsetSec({
  currentReplayMs,
  ...overlap
}: Parameters<typeof overlapOffsetSec>[0] & { currentReplayMs: number }) {
  return overlapOffsetSec(overlap) ?? -currentReplayMs / 1000;
}

export function targetMediaTime(replayMs: number, offsetSec: number) {
  return replayMs / 1000 + offsetSec;
}

/** Drift that starts a rate correction while playing. */
const RATE_START_SEC = 0.1;
/** Drift at which an in-progress rate correction ends. */
const RATE_STOP_SEC = 0.02;
/** Drift beyond which playback hard-seeks instead of nudging the rate. */
const PLAYING_SEEK_THRESHOLD_SEC = 1;
const RATE_NUDGE = 0.05;

// Chromium rejects rates outside [1/16, 16].
const clampRate = (rate: number) => Math.min(Math.max(rate, 0.0625), 16);

/**
 * While playing, absorbs drift with a fixed playbackRate nudge and hysteresis,
 * since seeks stall decoding and each rate change can glitch audio.
 */
export function planCorrection({
  currentSec,
  targetSec,
  speed,
  playing,
  currentRate,
}: {
  currentSec: number;
  targetSec: number;
  speed: number;
  playing: boolean;
  currentRate: number;
}): { seekTo?: number; rate: number } {
  const drift = targetSec - currentSec;
  if (!playing)
    return Math.abs(drift) > DRIFT_THRESHOLD_SEC
      ? { seekTo: targetSec, rate: speed }
      : { rate: speed };
  if (Math.abs(drift) > PLAYING_SEEK_THRESHOLD_SEC * Math.max(1, speed))
    return { seekTo: targetSec, rate: speed };
  const fast = clampRate(speed * (1 + RATE_NUDGE));
  const slow = clampRate(speed * (1 - RATE_NUDGE));
  const isRate = (rate: number) => Math.abs(currentRate - rate) < 1e-6;
  const correcting =
    (isRate(fast) && fast !== speed) || (isRate(slow) && slow !== speed);
  if (correcting) {
    const overshot = drift > 0 !== currentRate > speed;
    return Math.abs(drift) < RATE_STOP_SEC || overshot
      ? { rate: speed }
      : { rate: currentRate };
  }
  if (Math.abs(drift) > RATE_START_SEC)
    return { rate: drift > 0 ? fast : slow };
  return { rate: speed };
}

/** Parses MediaInfo dates such as `2024-01-02 03:04:05 UTC` or `UTC 2024-01-02 03:04:05`. */
export function parseMediaInfoDate(value: string | undefined) {
  if (!value) return undefined;
  const match = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(
    value,
  );
  if (!match) return undefined;
  const utc = /UTC|Z\b/.test(value);
  const ms = Date.parse(`${match[1]}T${match[2]}${utc ? 'Z' : ''}`);
  return Number.isFinite(ms) ? ms : undefined;
}

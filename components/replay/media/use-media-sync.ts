import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import {
  DRIFT_THRESHOLD_SEC,
  planCorrection,
  targetMediaTime,
} from './media-timing';

/** Minimal control surface shared by HTML media elements and embedded players. */
export interface MediaPlayerAdapter {
  getCurrentTime(): number;
  /** Seconds, or Infinity when the player cannot report a duration. */
  getDuration(): number;
  isPaused(): boolean;
  isSeeking(): boolean;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getRate(): number;
  /** Omitted by players that cannot change playback rate. */
  setRate?: (rate: number) => void;
  setVolume(volume: number, muted: boolean): void;
}

/** Replay playback state shared by every media item. */
export interface ReplayPlaybackProps {
  clock: MutableRefObject<number>;
  timeMs: number;
  playing: boolean;
  speed: number;
  waiting: boolean;
  aligning: boolean;
  volume: number;
}

export function useMediaSync({
  player,
  sourceLabel,
  offset,
  onUserOffset,
  clock,
  timeMs,
  playing,
  speed,
  waiting,
  aligning,
  volume,
}: ReplayPlaybackProps & {
  player: MediaPlayerAdapter | undefined;
  sourceLabel: string;
  offset: number | undefined;
  onUserOffset: (offset: number) => void;
}) {
  const programmaticSeek = useRef(false);
  const seekId = useId();
  const lastSeekAt = useRef<number>();
  const speedSupported = speed === 1 || player?.setRate !== undefined;

  const sync = useCallback(
    (trigger: 'state/time update' | 'seek retry') => {
      if (!player || offset === undefined) return;
      const duration = player.getDuration();
      if (Number.isNaN(duration)) return;
      const nextVolume = Math.min(Math.max(volume, 0), 1);
      player.setVolume(nextVolume, nextVolume === 0);
      const target = targetMediaTime(clock.current, offset);
      const clamped = Math.min(Math.max(target, 0), duration);
      const shouldPlay =
        !aligning &&
        playing &&
        !waiting &&
        speedSupported &&
        target >= 0 &&
        target < duration;
      // Paused seeks don't stall playback, so retarget immediately (e.g. rapid offset edits).
      if (!player.isSeeking() || player.isPaused()) {
        const currentSec = player.getCurrentTime();
        const playerPaused = player.isPaused();
        const correctingDuringPlayback = shouldPlay && !playerPaused;
        const currentRate = player.getRate();
        const { seekTo, rate } = planCorrection({
          currentSec,
          targetSec: clamped,
          speed,
          playing: correctingDuringPlayback,
          currentRate,
        });
        if (player.setRate && Math.abs(player.getRate() - rate) > 0.001)
          player.setRate(rate);
        if (seekTo !== undefined) {
          const now = performance.now();
          const driftSec = seekTo - currentSec;
          console.log(
            `[media seek] ${new Date().toISOString()} ${sourceLabel} (${seekId}): ${correctingDuringPlayback ? 'playback drift' : 'paused position correction'}, drift ${driftSec.toFixed(3)}s`,
            {
              trigger,
              currentSec,
              targetSec: seekTo,
              driftSec,
              replaySec: clock.current / 1000,
              offsetSec: offset,
              previousSeekMs:
                lastSeekAt.current === undefined
                  ? null
                  : now - lastSeekAt.current,
              playing,
              playerPaused,
              playerSeeking: player.isSeeking(),
              waiting,
              aligning,
              speed,
              currentRate,
              requestedRate: rate,
              speedSupported,
              unclampedTargetSec: target,
              durationSec: duration,
            },
          );
          lastSeekAt.current = now;
          programmaticSeek.current = true;
          player.seek(seekTo);
        }
      }
      // The user drives playback directly while aligning.
      if (aligning) return;
      if (shouldPlay && player.isPaused()) player.play();
      else if (!shouldPlay && !player.isPaused()) player.pause();
    },
    [
      player,
      offset,
      clock,
      volume,
      speed,
      speedSupported,
      aligning,
      playing,
      waiting,
      sourceLabel,
      seekId,
    ],
  );

  useEffect(() => {
    sync('state/time update');
    if (!player?.isSeeking()) return;
    // Corrections are skipped mid-seek; retry so the latest offset still lands.
    const retry = setInterval(() => {
      if (player.isSeeking()) return;
      sync('seek retry');
      if (!player.isSeeking()) clearInterval(retry);
    }, 100);
    return () => clearInterval(retry);
  }, [sync, timeMs, player]);

  useEffect(() => {
    if (aligning) player?.pause();
  }, [aligning, player]);

  /** Call when the player reports its position changed, e.g. on timeupdate. */
  const onPlayerTimeChange = useCallback(() => {
    if (
      !aligning ||
      !player ||
      programmaticSeek.current ||
      player.isSeeking() ||
      offset === undefined
    )
      return;
    const currentSec = player.getCurrentTime();
    // Positions that already match the offset aren't user scrubs.
    if (
      Math.abs(currentSec - targetMediaTime(clock.current, offset)) <=
      DRIFT_THRESHOLD_SEC
    )
      return;
    onUserOffset(currentSec - clock.current / 1000);
  }, [aligning, player, offset, clock, onUserOffset]);

  /** Call when the player finishes a seek. */
  const onPlayerSeeked = useCallback(() => {
    const now = performance.now();
    console.log(
      `[media seek] ${new Date().toISOString()} ${sourceLabel} (${seekId}): seeked event`,
      {
        programmatic: programmaticSeek.current,
        sinceCommandMs:
          programmaticSeek.current && lastSeekAt.current !== undefined
            ? now - lastSeekAt.current
            : null,
        currentSec: player?.getCurrentTime(),
      },
    );
    if (programmaticSeek.current) programmaticSeek.current = false;
    else onPlayerTimeChange();
  }, [onPlayerTimeChange, player, sourceLabel, seekId]);

  return { speedSupported, onPlayerTimeChange, onPlayerSeeked };
}

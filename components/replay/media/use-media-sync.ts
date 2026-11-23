import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
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
  offset: number | undefined;
  onUserOffset: (offset: number) => void;
}) {
  const programmaticSeek = useRef(false);
  const speedSupported = speed === 1 || player?.setRate !== undefined;

  const sync = useCallback(() => {
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
      const { seekTo, rate } = planCorrection({
        currentSec: player.getCurrentTime(),
        targetSec: clamped,
        speed,
        playing: shouldPlay && !player.isPaused(),
        currentRate: player.getRate(),
      });
      if (player.setRate && Math.abs(player.getRate() - rate) > 0.001)
        player.setRate(rate);
      if (seekTo !== undefined) {
        programmaticSeek.current = true;
        player.seek(seekTo);
      }
    }
    // The user drives playback directly while aligning.
    if (aligning) return;
    if (shouldPlay && player.isPaused()) player.play();
    else if (!shouldPlay && !player.isPaused()) player.pause();
  }, [
    player,
    offset,
    clock,
    volume,
    speed,
    speedSupported,
    aligning,
    playing,
    waiting,
  ]);

  useEffect(() => {
    sync();
    if (!player?.isSeeking()) return;
    // Corrections are skipped mid-seek; retry so the latest offset still lands.
    const retry = setInterval(() => {
      if (player.isSeeking()) return;
      sync();
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
    if (programmaticSeek.current) programmaticSeek.current = false;
    else onPlayerTimeChange();
  }, [onPlayerTimeChange]);

  return { speedSupported, onPlayerTimeChange, onPlayerSeeked };
}

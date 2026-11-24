import { Flex, Icon } from '@chakra-ui/react';
import { Music } from 'lucide-react';
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { ITimingObject } from 'timing-object';
import { MediaItemFrame } from './media-item-frame';
import { readEmbeddedDateMs } from './media-metadata';
import {
  DRIFT_THRESHOLD_SEC,
  initialOffsetSec,
  recordingStartMs,
  targetMediaTime,
} from './media-timing';
import { offsetStorageKey, useMediaOffset } from './use-media-offset';
import type { ReplayPlaybackProps } from './use-media-sync';

export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.mov'];
export const AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.m4a',
  '.aac',
];

function isAudioFile(file: File) {
  if (file.type) return file.type.startsWith('audio/');
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function bindFileMediaTiming(
  media: HTMLMediaElement,
  timingObject: ITimingObject,
  offset: number,
  setTimingsrc: typeof import('timingsrc').setTimingsrc,
) {
  return setTimingsrc(media, timingObject, (vector) => ({
    ...vector,
    position:
      media.seeking && vector.velocity !== 0
        ? media.currentTime
        : vector.position + offset,
  }));
}

export function FileMediaItem({
  file,
  timingObject,
  matchId,
  matchStartMs,
  matchDurationMs,
  onRemove,
  ...playback
}: ReplayPlaybackProps & {
  file: File;
  timingObject: ITimingObject | undefined;
  matchId: string;
  matchStartMs: number;
  matchDurationMs: number;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string>();
  const [player, setPlayer] = useState<HTMLMediaElement>();
  const programmaticSeek = useRef(false);
  const seekId = useId();
  const lastSeekAt = useRef<number>();
  const [loadError, setLoadError] = useState<string>();
  const { offset, offsetText, applyOffset, restoreOrApply, onOffsetInput } =
    useMediaOffset(
      offsetStorageKey(
        matchId,
        `${file.name}:${file.size}:${file.lastModified}`,
      ),
    );
  useEffect(() => {
    if (!player || !timingObject || offset === undefined || playback.aligning)
      return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    void import('timingsrc')
      .then(({ setTimingsrc }) => {
        if (!cancelled)
          detach = bindFileMediaTiming(
            player,
            timingObject,
            offset,
            setTimingsrc,
          );
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [player, timingObject, offset, playback.aligning]);

  useEffect(() => {
    if (!player) return;
    const volume = Math.min(Math.max(playback.volume, 0), 1);
    if (player.volume !== volume) player.volume = volume;
    if (player.muted !== (volume === 0)) player.muted = volume === 0;
  }, [player, playback.volume]);

  useEffect(() => {
    if (playback.aligning) player?.pause();
  }, [player, playback.aligning]);

  const onPlayerTimeChange = useCallback(() => {
    if (
      !playback.aligning ||
      !player ||
      programmaticSeek.current ||
      player.seeking ||
      offset === undefined
    )
      return;
    const target = targetMediaTime(playback.clock.current, offset);
    const clampedTarget = Number.isNaN(player.duration)
      ? target
      : Math.min(Math.max(target, 0), player.duration);
    if (
      Math.abs(player.currentTime - clampedTarget) <= DRIFT_THRESHOLD_SEC
    )
      return;
    applyOffset(player.currentTime - playback.clock.current / 1000);
  }, [playback.aligning, playback.clock, player, offset, applyOffset]);

  const onPlayerSeeked = useCallback(() => {
    console.log(
      `[media seek] ${new Date().toISOString()} ${file.name} (${seekId}): seeked event`,
      {
        programmatic: programmaticSeek.current,
        sinceSeekingMs:
          lastSeekAt.current === undefined
            ? null
            : performance.now() - lastSeekAt.current,
        currentSec: player?.currentTime,
      },
    );
    if (programmaticSeek.current) programmaticSeek.current = false;
    else onPlayerTimeChange();
  }, [file.name, onPlayerTimeChange, player, seekId]);

  const onManualOffsetInput = useCallback(
    (details: { value: string; valueAsNumber: number }) => {
      onOffsetInput(details);
      if (
        !playback.aligning ||
        !player ||
        !Number.isFinite(details.valueAsNumber) ||
        Number.isNaN(player.duration)
      )
        return;
      const offsetSec = Math.round(details.valueAsNumber * 100) / 100;
      const target = Math.min(
        Math.max(targetMediaTime(playback.clock.current, offsetSec), 0),
        player.duration,
      );
      if (player.currentTime !== target) {
        programmaticSeek.current = true;
        player.currentTime = target;
      }
    },
    [onOffsetInput, playback.aligning, playback.clock, player],
  );

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(undefined);
    };
  }, [file]);

  const setMediaElement = useCallback((element: HTMLMediaElement | null) => {
    setPlayer(element ?? undefined);
  }, []);

  const handleLoadedMetadata = (durationSec: number) =>
    restoreOrApply(async () => {
      const encodedMs = await readEmbeddedDateMs(file).catch(() => undefined);
      return initialOffsetSec({
        mediaStartMs: recordingStartMs({
          encodedMs,
          lastModifiedMs: file.lastModified,
          durationSec,
        }),
        durationSec,
        matchStartMs,
        matchDurationMs,
        currentReplayMs: playback.clock.current,
      });
    });

  const mediaProps: ComponentProps<'video'> & ComponentProps<'audio'> = {
    ref: setMediaElement,
    src: url,
    controls: playback.aligning,
    preload: 'auto',
    onLoadedMetadata: (e) => handleLoadedMetadata(e.currentTarget.duration),
    onError: (e) =>
      setLoadError(e.currentTarget.error?.message ?? 'Unable to load media.'),
    onSeeking: (event) => {
      const now = performance.now();
      console.log(
        `[media seek] ${new Date().toISOString()} ${file.name} (${seekId}): seeking event`,
        {
          targetSec: event.currentTarget.currentTime,
          replaySec: playback.clock.current / 1000,
          expectedSec:
            offset === undefined
              ? undefined
              : targetMediaTime(playback.clock.current, offset),
          sincePreviousSeekingMs:
            lastSeekAt.current === undefined ? null : now - lastSeekAt.current,
          playing: playback.playing,
          aligning: playback.aligning,
        },
      );
      lastSeekAt.current = now;
      if (!playback.aligning) programmaticSeek.current = true;
    },
    onSeeked: onPlayerSeeked,
    onTimeUpdate: onPlayerTimeChange,
  };

  return (
    <MediaItemFrame
      title={file.name}
      offset={offset}
      offsetText={offsetText}
      onOffsetInput={onManualOffsetInput}
      onRemove={onRemove}
      error={loadError}
      isAligning={playback.aligning}
    >
      {isAudioFile(file) ? (
        <Flex direction="column" align="center" gap={1}>
          {!playback.aligning && (
            <Icon size="xl" color="fg.muted" aria-label="Audio track">
              <Music />
            </Icon>
          )}
          <audio {...mediaProps} style={{ width: '100%' }} />
        </Flex>
      ) : (
        <video
          {...mediaProps}
          playsInline
          style={{ display: 'block', width: '100%', maxHeight: '60vh' }}
        />
      )}
    </MediaItemFrame>
  );
}

import { Flex, Icon } from '@chakra-ui/react';
import { Music } from 'lucide-react';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { MediaItemFrame } from './media-item-frame';
import { readEmbeddedDateMs } from './media-metadata';
import { initialOffsetSec, recordingStartMs } from './media-timing';
import { offsetStorageKey, useMediaOffset } from './use-media-offset';
import {
  type MediaPlayerAdapter,
  type ReplayPlaybackProps,
  useMediaSync,
} from './use-media-sync';

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

function htmlMediaAdapter(media: HTMLMediaElement): MediaPlayerAdapter {
  return {
    getCurrentTime: () => media.currentTime,
    getDuration: () => media.duration,
    isPaused: () => media.paused,
    isSeeking: () => media.seeking,
    play: () => void media.play().catch(() => undefined),
    pause: () => media.pause(),
    seek: (seconds) => {
      media.currentTime = seconds;
    },
    getRate: () => media.playbackRate,
    setRate: (rate) => {
      media.playbackRate = rate;
    },
    setVolume: (volume, muted) => {
      if (media.volume !== volume) media.volume = volume;
      if (media.muted !== muted) media.muted = muted;
    },
  };
}

export function FileMediaItem({
  file,
  matchId,
  matchStartMs,
  matchDurationMs,
  onRemove,
  ...playback
}: ReplayPlaybackProps & {
  file: File;
  matchId: string;
  matchStartMs: number;
  matchDurationMs: number;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string>();
  const [player, setPlayer] = useState<MediaPlayerAdapter>();
  const [loadError, setLoadError] = useState<string>();
  const { offset, offsetText, applyOffset, restoreOrApply, onOffsetInput } =
    useMediaOffset(
      offsetStorageKey(
        matchId,
        `${file.name}:${file.size}:${file.lastModified}`,
      ),
    );
  const { onPlayerTimeChange, onPlayerSeeked } = useMediaSync({
    ...playback,
    player,
    offset,
    onUserOffset: applyOffset,
  });

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(undefined);
    };
  }, [file]);

  const setMediaElement = useCallback((element: HTMLMediaElement | null) => {
    setPlayer(element ? htmlMediaAdapter(element) : undefined);
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
    onSeeked: onPlayerSeeked,
    onTimeUpdate: onPlayerTimeChange,
  };

  return (
    <MediaItemFrame
      title={file.name}
      offset={offset}
      offsetText={offsetText}
      onOffsetInput={onOffsetInput}
      onRemove={onRemove}
      error={loadError}
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

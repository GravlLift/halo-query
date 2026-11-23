import { FileMediaItem } from './file-media-item';
import type { MediaSource } from './media-source-picker';
import { TwitchMediaItem } from './twitch-media-item';
import type { ReplayPlaybackProps } from './use-media-sync';

export interface MediaItemProps extends ReplayPlaybackProps {
  source: MediaSource;
  matchId: string;
  matchStartMs: number;
  matchDurationMs: number;
  onRemove: () => void;
}

export function MediaItem({
  source,
  matchStartMs,
  matchDurationMs,
  ...props
}: MediaItemProps) {
  if (source.kind === 'twitch')
    return (
      <TwitchMediaItem
        {...props}
        video={source.video}
        matchStartMs={matchStartMs}
        matchDurationMs={matchDurationMs}
      />
    );
  return (
    <FileMediaItem
      {...props}
      file={source.file}
      matchStartMs={matchStartMs}
      matchDurationMs={matchDurationMs}
    />
  );
}

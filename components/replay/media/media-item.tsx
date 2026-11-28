import { FileMediaItem } from './file-media-item';
import type { MediaSource } from './media-source-picker';
import { TwitchMediaItem } from './twitch-media-item';
import type { ReplayPlaybackProps } from './use-media-sync';
import type { ITimingObject } from 'timing-object';
import type { HTMLAttributes } from 'react';

export interface MediaItemProps extends ReplayPlaybackProps {
  source: MediaSource;
  timingObject: ITimingObject | undefined;
  matchId: string;
  matchStartMs: number;
  matchDurationMs: number;
  onRemove: () => void;
  dragHandleProps: HTMLAttributes<HTMLButtonElement>;
}

export function MediaItem({ source, timingObject, ...props }: MediaItemProps) {
  if (source.kind === 'twitch')
    return <TwitchMediaItem {...props} video={source.video} />;
  return (
    <FileMediaItem {...props} file={source.file} timingObject={timingObject} />
  );
}

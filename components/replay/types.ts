import type { MatchReplay } from '../../lib/film';
import type { MapBackground, MapBounds } from '@gravllift/halo-film-ui/view';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; progress: string }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      replay: MatchReplay;
      complete: boolean;
      progress?: string;
      error?: string;
    };

export type LoadedBackground = MapBackground;
export type Bounds = MapBounds;

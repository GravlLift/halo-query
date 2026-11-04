import type { MapBackground, MatchReplay } from '@gravllift/halo-film';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; progress: string }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      replay: MatchReplay;
    };

export type LoadedBackground = Omit<MapBackground, 'image'> & {
  element: HTMLImageElement;
  /** Extent of the non-transparent pixels, in normalized film space. */
  content: Bounds;
};

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

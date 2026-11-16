import type {
  FilmChunkInput,
  FilmManifest,
  FilmMatchStats,
  ReplayBuildData,
} from '../../lib/film';

export interface DecodeRequest {
  film: FilmManifest;
  match: FilmMatchStats;
  chunks: FilmChunkInput[];
  indexes: number[];
  partial: boolean;
}

export type DecodeResponse =
  | { type: 'stage'; stage: string }
  | { type: 'result'; data: ReplayBuildData }
  | { type: 'error'; message: string };

export function createReplayDecoder() {
  const worker = new Worker(
    new URL('./replay-decoder.worker.ts', import.meta.url),
  );
  const sent = new Set<number>();

  return {
    decode: (
      film: FilmManifest,
      chunks: readonly FilmChunkInput[],
      match: FilmMatchStats,
      onStage: ((stage: string) => void) | undefined,
      partial: boolean,
      signal?: AbortSignal,
    ): Promise<ReplayBuildData> =>
      new Promise((resolve, reject) => {
        const cleanup = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          worker.removeEventListener('messageerror', onError);
          signal?.removeEventListener('abort', onAbort);
        };
        const onMessage = (event: MessageEvent<DecodeResponse>) => {
          if (event.data.type === 'stage') {
            onStage?.(event.data.stage);
            return;
          }
          cleanup();
          if (event.data.type === 'result') resolve(event.data.data);
          else reject(new Error(event.data.message));
        };
        const onError = () => {
          cleanup();
          reject(new Error('Replay decoding worker failed'));
        };
        const onAbort = () => {
          cleanup();
          worker.terminate();
          reject(signal?.reason ?? new Error('Replay loading canceled'));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onError);
        signal?.addEventListener('abort', onAbort, { once: true });
        const newChunks = chunks.filter((chunk) => !sent.has(chunk.index));
        try {
          const request: DecodeRequest = {
            film,
            match,
            chunks: newChunks,
            indexes: chunks.map((chunk) => chunk.index),
            partial,
          };
          worker.postMessage(request);
          newChunks.forEach((chunk) => sent.add(chunk.index));
        } catch (error) {
          cleanup();
          reject(error);
        }
      }),
    terminate: () => worker.terminate(),
  };
}

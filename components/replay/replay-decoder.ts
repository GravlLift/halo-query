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
  | { type: 'ready' }
  | { type: 'stage'; stage: string }
  | { type: 'result'; data: ReplayBuildData }
  | { type: 'error'; message: string };

export function createReplayDecoder() {
  const worker = new Worker(
    new URL('./replay-decoder.worker.ts', import.meta.url),
  );
  const sent = new Set<number>();
  let started = false;
  const onReady = (event: MessageEvent<DecodeResponse>) => {
    if (event.data.type !== 'ready') return;
    started = true;
    worker.removeEventListener('message', onReady);
  };
  worker.addEventListener('message', onReady);

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
        let startupTimeout: ReturnType<typeof setTimeout> | undefined;
        const cleanup = () => {
          clearTimeout(startupTimeout);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          worker.removeEventListener('messageerror', onError);
          signal?.removeEventListener('abort', onAbort);
        };
        const onMessage = (event: MessageEvent<DecodeResponse>) => {
          started = true;
          clearTimeout(startupTimeout);
          if (event.data.type === 'ready') return;
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
        if (!started) {
          startupTimeout = setTimeout(() => {
            if (started) return;
            cleanup();
            worker.removeEventListener('message', onReady);
            worker.terminate();
            reject(
              new Error(
                'Replay worker did not start within 30 seconds. Retry loading the replay, or hard-refresh this tab if its worker bundle is stale.',
              ),
            );
          }, 30_000);
        }
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
    terminate: () => {
      worker.removeEventListener('message', onReady);
      worker.terminate();
    },
  };
}

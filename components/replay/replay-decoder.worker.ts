import { decodeReplay, type FilmChunkInput } from '../../lib/film';
import type { DecodeRequest, DecodeResponse } from './replay-decoder';

const chunks = new Map<number, FilmChunkInput>();

self.addEventListener('message', async (event: MessageEvent<DecodeRequest>) => {
  const request = event.data;
  request.chunks.forEach((chunk) => chunks.set(chunk.index, chunk));
  try {
    const ordered = request.indexes.map((index) => {
      const chunk = chunks.get(index);
      if (!chunk) throw new Error(`Missing film chunk ${index}`);
      return chunk;
    });
    const data = await decodeReplay(
      request.film,
      ordered,
      request.match,
      (stage) => postMessage({ type: 'stage', stage } satisfies DecodeResponse),
      request.partial,
      undefined,
    );
    postMessage({ type: 'result', data } satisfies DecodeResponse);
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies DecodeResponse);
  }
});

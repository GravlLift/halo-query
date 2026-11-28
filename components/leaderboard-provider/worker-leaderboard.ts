import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { ResolvablePromise } from '@gravllift/utilities';
import { useEffect, useMemo, useRef } from 'react';
import { handleAll, retry } from 'cockatiel';

const retryEverythingPolicy = retry(handleAll, { maxAttempts: 3 });

const callMap = new Map<
  number,
  ResolvablePromise<
    Awaited<ReturnType<ILeaderboardProvider[keyof ILeaderboardProvider]>>
  >
>();
let workerRestarts = 0;
export function useLeaderboardProvider(): ILeaderboardProvider {
  const workerRef = useRef<Worker | null>(null);

  const workerLeaderboard = useMemo((): ILeaderboardProvider => {
    function callLeaderboardProviderFn<
      TFunction extends keyof ILeaderboardProvider,
    >(
      fn: TFunction,
      args: Parameters<ILeaderboardProvider[TFunction]>,
    ): ReturnType<ILeaderboardProvider[TFunction]> {
      const callId = Math.random();
      const abort = () => {
        workerRef.current?.postMessage({ callId, cancel: true });
      };
      const promise = new ResolvablePromise<
        Awaited<ReturnType<ILeaderboardProvider[keyof ILeaderboardProvider]>>
      >();
      callMap.set(callId, promise);
      let workerArgs: unknown[] = args;
      switch (fn) {
        case 'getGamertagIndex': {
          const signal = args[3];
          signal?.addEventListener('abort', abort);
          const cleanup = () => signal?.removeEventListener('abort', abort);
          void promise.then(cleanup, cleanup);
          // Signal cannot be transmitted, remove it from arg list
          workerArgs = args.slice(0, 3);
          break;
        }
      }
      workerRef.current?.postMessage({
        callId,
        fn,
        args: workerArgs,
      });
      return promise as ReturnType<ILeaderboardProvider[TFunction]>;
    }

    return new Proxy({} as ILeaderboardProvider, {
      get(_target, prop) {
        return (...args: unknown[]) =>
          retryEverythingPolicy.execute(async () =>
            callLeaderboardProviderFn(
              prop as keyof ILeaderboardProvider,
              args as any,
            ),
          );
      },
    });
  }, []);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.ts', import.meta.url));
    const messageHandler = (
      event: MessageEvent<
        | {
            callId: number;
            result: Awaited<
              ReturnType<ILeaderboardProvider[keyof ILeaderboardProvider]>
            >;
          }
        | {
            callId: number;
            error: unknown;
            forceReload: boolean;
          }
      >,
    ): void => {
      const promise = callMap.get(event.data.callId);
      if (!promise) {
        return;
      }
      if ('result' in event.data) {
        promise.resolve(event.data.result);
      } else {
        if (typeof event.data.error === 'string') {
          event.data.error = JSON.parse(event.data.error);
        }
        if (event.data.forceReload && workerRef.current) {
          if (workerRestarts < 3) {
            workerRef.current.removeEventListener('message', messageHandler);
            workerRef.current.terminate();

            workerRef.current = new Worker(
              new URL('./worker.ts', import.meta.url),
            );
            workerRef.current.addEventListener('message', messageHandler);
            workerRestarts++;
          } else {
            const searchParams = new URLSearchParams(location.search);
            if (!searchParams.has('force-reload')) {
              searchParams.set('force-reload', '1');
              location.search = searchParams.toString();
            }
          }
        }
        promise.reject(event.data.error);
      }
      callMap.delete(event.data.callId);
    };
    workerRef.current.addEventListener('message', messageHandler);

    return () => {
      workerRef.current?.removeEventListener('message', messageHandler);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return workerLeaderboard;
}

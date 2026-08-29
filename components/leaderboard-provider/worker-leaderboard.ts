import type { ReadWriteLeaderboardProvider } from '@gravllift/halo-helpers';
import { ResolvablePromise } from '@gravllift/utilities';
import { useEffect, useMemo, useRef } from 'react';
import { handleAll, retry } from 'cockatiel';

const retryEverythingPolicy = retry(handleAll, { maxAttempts: 3 });

const callMap = new Map<
  number,
  ResolvablePromise<
    Awaited<
      ReturnType<
        ReadWriteLeaderboardProvider[keyof ReadWriteLeaderboardProvider]
      >
    >
  >
>();
let workerRestarts = 0;
export function useLeaderboardProvider(): ReadWriteLeaderboardProvider {
  const workerRef = useRef<Worker | null>(null);

  const workerLeaderboard = useMemo((): ReadWriteLeaderboardProvider => {
    function callLeaderboardProviderFn<
      TFunction extends keyof ReadWriteLeaderboardProvider,
    >(
      fn: TFunction,
      args: Parameters<ReadWriteLeaderboardProvider[TFunction]>
    ): ReturnType<ReadWriteLeaderboardProvider[TFunction]> {
      const callId = Math.random();
      const abort = () => {
        workerRef.current?.postMessage({ callId, cancel: true });
      };
      const promise = new ResolvablePromise<
        Awaited<
          ReturnType<
            ReadWriteLeaderboardProvider[keyof ReadWriteLeaderboardProvider]
          >
        >
      >();
      callMap.set(callId, promise);
      switch (fn) {
        case 'getXuidIndex':
          args[3]?.addEventListener('abort', abort);
          promise.finally(() => args[3]?.removeEventListener('abort', abort));
          // Signal cannot be transmitted, remove it from arg list
          args = args.slice(0, 3) as Parameters<
            ReadWriteLeaderboardProvider[TFunction]
          >;
          break;
      }
      workerRef.current?.postMessage({
        callId,
        fn,
        args,
      });
      return promise as ReturnType<ReadWriteLeaderboardProvider[TFunction]>;
    }

    return new Proxy({} as ReadWriteLeaderboardProvider, {
      get(_target, prop) {
        return (...args: unknown[]) =>
          retryEverythingPolicy.execute(async () =>
            callLeaderboardProviderFn(
              prop as keyof ReadWriteLeaderboardProvider,
              args as any
            )
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
              ReturnType<
                ReadWriteLeaderboardProvider[keyof ReadWriteLeaderboardProvider]
              >
            >;
          }
        | {
            callId: number;
            error: unknown;
            forceReload: boolean;
          }
      >
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
            workerRef.current.postMessage({ terminate: true });
            workerRef.current.removeEventListener('message', messageHandler);

            workerRef.current = new Worker(
              new URL('./worker.ts', import.meta.url)
            );
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
      workerRef.current?.postMessage({ terminate: true });
      workerRef.current?.removeEventListener('message', messageHandler);
    };
  }, []);

  return workerLeaderboard;
}

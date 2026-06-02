import type {
  ILeaderboardProvider,
  KnowledgeMapLeaderboardProvider,
} from '@gravllift/halo-helpers';
import { ResolvablePromise } from '@gravllift/utilities';
import { useEffect, useMemo, useRef } from 'react';
import { handleAll, retry } from 'cockatiel';

const retryEverythingPolicy = retry(handleAll, { maxAttempts: 3 });

const callMap = new Map<
  number,
  ResolvablePromise<
    Awaited<
      ReturnType<
        KnowledgeMapLeaderboardProvider[keyof KnowledgeMapLeaderboardProvider]
      >
    >
  >
>();
let workerRestarts = 0;
export function useLeaderboardProvider(): KnowledgeMapLeaderboardProvider {
  const workerRef = useRef<Worker | null>(null);

  const workerLeaderboard = useMemo((): KnowledgeMapLeaderboardProvider => {
    function callLeaderboardProviderFn<
      TFunction extends keyof KnowledgeMapLeaderboardProvider,
    >(
      fn: TFunction,
      args: Parameters<KnowledgeMapLeaderboardProvider[TFunction]>,
    ): ReturnType<KnowledgeMapLeaderboardProvider[TFunction]> {
      const callId = Math.random();
      const abort = () => {
        workerRef.current?.postMessage({ callId, cancel: true });
      };
      const promise = new ResolvablePromise<
        Awaited<
          ReturnType<
            KnowledgeMapLeaderboardProvider[keyof KnowledgeMapLeaderboardProvider]
          >
        >
      >();
      callMap.set(callId, promise);
      switch (fn) {
        case 'getGamertagIndex':
          args[3]?.addEventListener('abort', abort);
          promise.finally(() => args[3]?.removeEventListener('abort', abort));
          // Signal cannot be transmitted, remove it from arg list
          args = args.slice(0, 3) as Parameters<
            KnowledgeMapLeaderboardProvider[TFunction]
          >;
          break;
      }
      workerRef.current?.postMessage({
        callId,
        fn,
        args,
      });
      return promise as ReturnType<KnowledgeMapLeaderboardProvider[TFunction]>;
    }

    return new Proxy({} as KnowledgeMapLeaderboardProvider, {
      get(_target, prop) {
        return (...args: unknown[]) =>
          retryEverythingPolicy.execute(async () =>
            callLeaderboardProviderFn(
              prop as keyof KnowledgeMapLeaderboardProvider,
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
              ReturnType<
                KnowledgeMapLeaderboardProvider[keyof KnowledgeMapLeaderboardProvider]
              >
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
            workerRef.current.postMessage({ terminate: true });
            workerRef.current.removeEventListener('message', messageHandler);

            workerRef.current = new Worker(
              new URL('./worker.ts', import.meta.url),
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

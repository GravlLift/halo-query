import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ResolvablePromise } from '@gravllift/utilities';
import type { ILeaderboardProvider } from '@gravllift/halo-helpers';

const callMap = new Map<
  number,
  ResolvablePromise<
    Awaited<ReturnType<ILeaderboardProvider[keyof ILeaderboardProvider]>>
  >
>();
export function useWorkerLeaderboard(): ILeaderboardProvider {
  const workerRef = useRef<Worker | null>(null);

  const workerLeaderboard = useMemo((): ILeaderboardProvider => {
    function callLeaderboardProviderFn<
      TFunction extends keyof ILeaderboardProvider
    >(
      fn: TFunction,
      args: Parameters<ILeaderboardProvider[TFunction]>
    ): ReturnType<ILeaderboardProvider[TFunction]> {
      const callId = Math.random();
      const abort = () => {
        workerRef.current?.postMessage({ callId, cancel: true });
      };
      const promise = new ResolvablePromise<
        Awaited<ReturnType<ILeaderboardProvider[keyof ILeaderboardProvider]>>
      >();
      callMap.set(callId, promise);
      switch (fn) {
        case 'getGamertagIndex':
          args[3]?.addEventListener('abort', abort);
          promise.finally(() => args[3]?.removeEventListener('abort', abort));
          // Signal cannot be transmitted, remove it from arg list
          args = args.slice(0, 3) as Parameters<
            ILeaderboardProvider[TFunction]
          >;
          break;
      }
      workerRef.current?.postMessage({
        callId,
        fn,
        args,
      });
      return promise as ReturnType<ILeaderboardProvider[TFunction]>;
    }

    return {
      initialized: () => callLeaderboardProviderFn('initialized', []),
      addLeaderboardEntries: (entries) =>
        callLeaderboardProviderFn('addLeaderboardEntries', [entries]),
      getAllEntries: () => callLeaderboardProviderFn('getAllEntries', []),
      getRandomEntry: () => callLeaderboardProviderFn('getRandomEntry', []),
      getGamertagIndex: (xuid, playlistAssetId, skillProp, signal) =>
        callLeaderboardProviderFn('getGamertagIndex', [
          xuid,
          playlistAssetId,
          skillProp,
          signal,
        ]),
      getSkillBuckets: (playlistAssetId, skillProp) =>
        callLeaderboardProviderFn('getSkillBuckets', [
          playlistAssetId,
          skillProp,
        ]),
      getRankedEntries: (playlistAssetId, options, skillProp) =>
        callLeaderboardProviderFn('getRankedEntries', [
          playlistAssetId,
          options,
          skillProp,
        ]),
      getPlaylistEntriesCount: (playlistAssetId) =>
        callLeaderboardProviderFn('getPlaylistEntriesCount', [playlistAssetId]),
      getPlaylistAssetIds: () =>
        callLeaderboardProviderFn('getPlaylistAssetIds', []),
      containsXuid: (xuid) => callLeaderboardProviderFn('containsXuid', [xuid]),
      getEntries: (xuid) => callLeaderboardProviderFn('getEntries', [xuid]),
    };
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
        if (event.data.forceReload) {
          // Prevent infinite reload loop
          const searchParams = new URLSearchParams(location.search);
          if (!searchParams.has('force-reload')) {
            searchParams.set('force-reload', '1');
            location.search = searchParams.toString();
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
    };
  }, []);

  return workerLeaderboard;
}

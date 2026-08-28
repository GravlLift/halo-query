import Dexie from 'dexie';
import leaderboard from '../../lib/leaderboard';
import type { ReadOnlyLeaderboardProvider } from '@gravllift/halo-helpers';
import { closeDatabase } from '../../lib/leaderboard/indexed-db/indexed-db-repository';

const signalMap = new Map<number, AbortController>();

async function leaderboardFn<
  const TFunction extends keyof ReadOnlyLeaderboardProvider,
>(
  event: MessageEvent<
    | {
        callId: number;
        fn: TFunction;
        args: Parameters<ReadOnlyLeaderboardProvider[TFunction]>;
      }
    | {
        callId: number;
        cancel: unknown;
      }
    | {
        terminate: true;
      }
  >
) {
  if ('terminate' in event.data) {
    try {
      for (const controller of signalMap.values()) {
        controller.abort('Worker terminating');
      }
      signalMap.clear();
      closeDatabase();
    } finally {
      close();
    }
  } else if ('cancel' in event.data) {
    const controller = signalMap.get(event.data.cancel as number);
    if (controller) {
      controller.abort('Operation cancelled by main thread');
    }
    return;
  } else {
    try {
      if (event.data.fn === 'getGamertagIndex') {
        const controller = new AbortController();
        event.data.args[3] = controller.signal;
        signalMap.set(event.data.callId, controller);
      }
      const result: Awaited<
        ReturnType<ReadOnlyLeaderboardProvider[TFunction]>
      > =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (leaderboard[event.data.fn] as any)(...(event.data.args as []));

      postMessage({ callId: event.data.callId, result });
    } catch (error) {
      postMessage({
        callId: event.data.callId,
        error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        forceReload: error instanceof Dexie.DexieError,
      });
    } finally {
      signalMap.delete(event.data.callId);
    }
  }
}

addEventListener('message', leaderboardFn);

import Dexie from 'dexie';
import leaderboard from '../../lib/leaderboard';
import type { ILeaderboardProvider } from '@gravllift/halo-helpers';

const signalMap = new Map<number, AbortController>();

async function leaderboardFn<
  const TFunction extends keyof ILeaderboardProvider
>(
  event: MessageEvent<
    | {
        callId: number;
        fn: TFunction;
        args: Parameters<ILeaderboardProvider[TFunction]>;
      }
    | {
        callId: number;
        cancel: unknown;
      }
  >
) {
  if ('cancel' in event.data) {
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
      const result: Awaited<ReturnType<ILeaderboardProvider[TFunction]>> =
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

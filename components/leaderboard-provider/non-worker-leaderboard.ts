import type { ReadWriteLeaderboardProvider } from '@gravllift/halo-helpers';

export function useLeaderboardProvider(): ReadWriteLeaderboardProvider {
  const providerPromise = import('../../lib/leaderboard');
  async function callLeaderboardProviderFn<
    TFunction extends keyof ReadWriteLeaderboardProvider,
  >(
    key: TFunction,
    args: Parameters<ReadWriteLeaderboardProvider[TFunction]>
  ): Promise<Awaited<ReturnType<ReadWriteLeaderboardProvider[TFunction]>>> {
    const provider = await providerPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (provider.default[key] as any)(...(args as [])) as Awaited<
      ReturnType<ReadWriteLeaderboardProvider[TFunction]>
    >;
  }
  return new Proxy({} as ReadWriteLeaderboardProvider, {
    get(_target, prop) {
      return (...args: unknown[]) =>
        callLeaderboardProviderFn(
          prop as keyof ReadWriteLeaderboardProvider,
          args as any
        );
    },
  });
}

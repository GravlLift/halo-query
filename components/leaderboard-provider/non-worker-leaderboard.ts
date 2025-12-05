import type { ILeaderboardProvider } from '@gravllift/halo-helpers';

export function useLeaderboardProvider(): ILeaderboardProvider {
  const providerPromise = import('../../lib/leaderboard');
  async function callLeaderboardProviderFn<
    TFunction extends keyof ILeaderboardProvider
  >(
    key: TFunction,
    args: Parameters<ILeaderboardProvider[TFunction]>
  ): Promise<Awaited<ReturnType<ILeaderboardProvider[TFunction]>>> {
    const provider = await providerPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (provider.default[key] as any)(...(args as [])) as Awaited<
      ReturnType<ILeaderboardProvider[TFunction]>
    >;
  }
  return new Proxy({} as ILeaderboardProvider, {
    get(_target, prop) {
      return (...args: unknown[]) =>
        callLeaderboardProviderFn(
          prop as keyof ILeaderboardProvider,
          args as any
        );
    },
  });
}

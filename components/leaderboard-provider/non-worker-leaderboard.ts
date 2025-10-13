import type { ILeaderboardProvider } from '@gravllift/halo-helpers';

export function useNonWorkerLeaderboard() {
  const providerPromise = import('../../lib/leaderboard');
  return {
    callLeaderboardProviderFn: async <
      TFunction extends keyof ILeaderboardProvider
    >(
      key: TFunction,
      args: Parameters<ILeaderboardProvider[TFunction]>
    ): Promise<Awaited<ReturnType<ILeaderboardProvider[TFunction]>>> => {
      const provider = await providerPromise;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (provider.default[key] as any)(...(args as [])) as Awaited<
        ReturnType<ILeaderboardProvider[TFunction]>
      >;
    },
  };
}

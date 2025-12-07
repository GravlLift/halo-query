import { HaloCaches, compareXuids } from '@gravllift/halo-helpers';
import { createContext, useContext } from 'react';
import { useLeaderboard } from '../../components/leaderboard-provider/leaderboard-context';
import { useApiClients } from './api-client-contexts';
import { waypointXboxRequestPolicy } from '../request-policy';

const HaloCachesContext = createContext<HaloCaches | null>(null);

export function useHaloCaches() {
  const context = useContext(HaloCachesContext);
  if (!context) {
    throw new Error('useHaloCaches must be used within a HaloCachesProvider');
  }
  return context;
}

export function HaloCachesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { haloInfiniteClient, xboxClient } = useApiClients();
  const leaderboard = useLeaderboard();
  return (
    <HaloCachesContext.Provider
      value={
        new HaloCaches(
          haloInfiniteClient,
          xboxClient,
          waypointXboxRequestPolicy,
          {
            async fetchManyFn(keys) {
              if (!leaderboard || (await leaderboard.initialized()) === false) {
                return [];
              }
              return leaderboard.getEntries(keys);
            },
            resultSelector(items, key) {
              return (
                items.find((entry) => compareXuids(entry.xuid, key)) ?? null
              );
            },
          }
        )
      }
    >
      {children}
    </HaloCachesContext.Provider>
  );
}

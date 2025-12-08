import { HaloCaches, compareXuids } from '@gravllift/halo-helpers';
import { createContext, useContext } from 'react';
import { useLeaderboard } from '../../components/leaderboard-provider/leaderboard-context';
import { useApiClients } from './api-client-contexts';
import { waypointXboxRequestPolicy } from '../request-policy';
import { TaskCancelledError, timeout, TimeoutStrategy } from 'cockatiel';
import { RelyingParty, XboxAuthenticationClient } from 'halo-infinite-api';
import { tokenPersister } from '../token-persisters/client';

const HaloCachesContext = createContext<HaloCaches | null>(null);

export function useHaloCaches() {
  const context = useContext(HaloCachesContext);
  if (!context) {
    throw new Error('useHaloCaches must be used within a HaloCachesProvider');
  }
  return context;
}

const policy = timeout(5000, {
  abortOnReturn: false,
  strategy: TimeoutStrategy.Aggressive,
});

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
        new HaloCaches(haloInfiniteClient, xboxClient, {
          requestPolicy: waypointXboxRequestPolicy,
          xuidIsCurrentUser: async (xuid: string) => {
            const xstsTicket = await tokenPersister.load<{
              DisplayClaims: {
                xui: [
                  {
                    xid: string;
                  }
                ];
              };
            }>(XboxAuthenticationClient.xstsTicketName(RelyingParty.Xbox));
            return (
              xstsTicket != null &&
              compareXuids(xuid, xstsTicket.DisplayClaims.xui[0].xid)
            );
          },
          additionalXuidFetcher: {
            async fetchManyFn(keys) {
              try {
                return await policy.execute(async () => {
                  if (
                    !leaderboard ||
                    (await leaderboard.initialized()) === false
                  ) {
                    return [];
                  }
                  return await leaderboard.getEntries(keys);
                });
              } catch (e) {
                if (e instanceof TaskCancelledError) {
                  return [];
                }
                throw e;
              }
            },
            resultSelector(items, key) {
              return (
                items.find((entry) => compareXuids(entry.xuid, key)) ?? null
              );
            },
          },
        })
      }
    >
      {children}
    </HaloCachesContext.Provider>
  );
}

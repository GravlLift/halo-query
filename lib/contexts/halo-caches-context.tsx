import { compareXuids, HaloCaches } from '@gravllift/halo-helpers';
import { timeout, TimeoutStrategy } from 'cockatiel';
import { RelyingParty, XboxAuthenticationClient } from 'halo-infinite-api';
import { createContext, useContext } from 'react';
import { waypointXboxRequestPolicy } from '../request-policy';
import { tokenPersister } from '../token-persisters/client';
import { useApiClients } from './api-client-contexts';

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
                  },
                ];
              };
            }>(XboxAuthenticationClient.xstsTicketName(RelyingParty.Xbox));
            return (
              xstsTicket != null &&
              compareXuids(xuid, xstsTicket.DisplayClaims.xui[0].xid)
            );
          },
          // TODO: Add graphql additionalXuidFetcher
        })
      }
    >
      {children}
    </HaloCachesContext.Provider>
  );
}

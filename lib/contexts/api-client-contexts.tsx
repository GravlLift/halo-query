'use client';
import {
  HaloAuthenticationClient,
  HaloInfiniteClient,
  RelyingParty,
  XboxAuthenticationClient,
  XboxClient,
} from 'halo-infinite-api';
import { createContext, ReactNode, useContext } from 'react';
import { fetcher } from '../clients/fetcher';
import { tokenPersister } from '../token-persisters/client';
import { SpreadableClassShape } from '@gravllift/utilities';
import { useAuthentication } from './authentication-contexts';

interface ApiClientsContextValue {
  haloInfiniteClient: HaloInfiniteClient;
  xboxAuthClient: SpreadableClassShape<typeof XboxAuthenticationClient> & {
    getCurrentGamertag: () => Promise<string>;
  };
  xboxClient: XboxClient;
  haloAuthClient: HaloAuthenticationClient;
}

const ApiClientsContext = createContext<ApiClientsContextValue | null>(null);

export function useApiClients() {
  const context = useContext(ApiClientsContext);
  if (!context) {
    throw new Error('useApiClients must be used within an ApiClientsProvider');
  }
  return context;
}

export function ApiClientsProvider({ children }: { children: ReactNode }) {
  const { acquireOauth2AccessToken } = useAuthentication();
  const xboxAuthClient = new XboxAuthenticationClient(tokenPersister, fetcher);

  const getXstsTicket = () =>
    xboxAuthClient.getXstsTicket(acquireOauth2AccessToken, RelyingParty.Xbox);

  const xboxClient = new XboxClient(
    {
      getXboxLiveV3Token: async () => {
        const xstsTicket = await getXstsTicket();
        return xboxAuthClient.getXboxLiveV3Token(xstsTicket);
      },
      clearXboxLiveV3Token: () =>
        xboxAuthClient.clearXstsTicket(RelyingParty.Xbox),
    },
    fetcher
  );

  const haloAuthClient = new HaloAuthenticationClient(
    async () => {
      const xstsTicket = await xboxAuthClient.getXstsTicket(
        acquireOauth2AccessToken,
        RelyingParty.Halo
      );
      return xstsTicket.Token;
    },
    () => xboxAuthClient.clearXstsTicket(RelyingParty.Halo),
    async () => {
      return await tokenPersister.load('halo.authToken');
    },
    async (token) => {
      await tokenPersister.save('halo.authToken', token);
    },
    async () => {
      await tokenPersister.clear('halo.authToken');
    },
    fetcher
  );

  const haloInfiniteClient = new HaloInfiniteClient(haloAuthClient, fetcher);

  return (
    <ApiClientsContext.Provider
      value={{
        haloInfiniteClient,
        xboxAuthClient: {
          ...xboxAuthClient,
          getCurrentGamertag: async () => {
            const xstsTicket = await getXstsTicket();
            return xstsTicket.DisplayClaims.xui[0].gtg;
          },
        },
        xboxClient,
        haloAuthClient,
      }}
    >
      {children}
    </ApiClientsContext.Provider>
  );
}

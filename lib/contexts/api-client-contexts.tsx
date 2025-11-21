'use client';
import { SpreadableClassShape } from '@gravllift/utilities';
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
import { useAuthentication } from './authentication-contexts';

class XboxCurrentGamertagAuthenticationClient extends XboxAuthenticationClient {
  public async getCurrentGamertag() {
    const xstsTicket = await this.getXstsTicket(RelyingParty.Xbox);
    return xstsTicket.DisplayClaims.xui[0].gtg;
  }
}

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
  const xboxAuthClient = new XboxCurrentGamertagAuthenticationClient(
    acquireOauth2AccessToken,
    tokenPersister,
    fetcher
  );

  const xboxClient = new XboxClient(
    {
      getXboxLiveV3Token: async () => {
        const xstsTicket = await xboxAuthClient.getXstsTicket(
          RelyingParty.Xbox
        );
        return xboxAuthClient.getXboxLiveV3Token(xstsTicket);
      },
      clearXboxLiveV3Token: () =>
        xboxAuthClient.clearXstsTicket(RelyingParty.Xbox),
    },
    fetcher
  );

  const haloAuthClient = new HaloAuthenticationClient(
    {
      fetchToken: async () => {
        const xstsTicket = await xboxAuthClient.getXstsTicket(
          RelyingParty.Halo
        );
        return xstsTicket.Token;
      },
      clearXstsToken: () => xboxAuthClient.clearXstsTicket(RelyingParty.Halo),
    },
    {
      loadToken: async () =>
        (await tokenPersister.load('halo.authToken')) ?? null,
      saveToken: async (token) => {
        await tokenPersister.save('halo.authToken', token);
      },
      clearToken: async () => {
        await tokenPersister.clear('halo.authToken');
      },
    },
    fetcher
  );

  const haloInfiniteClient = new HaloInfiniteClient(haloAuthClient, fetcher);

  return (
    <ApiClientsContext.Provider
      value={{
        haloInfiniteClient,
        xboxAuthClient,
        xboxClient,
        haloAuthClient,
      }}
    >
      {children}
    </ApiClientsContext.Provider>
  );
}

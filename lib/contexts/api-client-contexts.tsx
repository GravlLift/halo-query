'use client';
import { isRequestError } from '@gravllift/halo-helpers';
import { SpreadableClassShape } from '@gravllift/utilities';
import {
  HaloAuthenticationClient,
  HaloInfiniteClient,
  RelyingParty,
  XboxAuthenticationClient,
  XboxClient,
} from 'halo-infinite-api';
import { createContext, ReactNode, useCallback, useContext } from 'react';
import { fetcher } from '../clients/fetcher';
import { tokenPersister } from '../token-persisters/client';
import { useAuthentication } from './authentication-contexts';
import { XboxLiveError } from './xbox-live-error';

class XboxCurrentGamertagAuthenticationClient extends XboxAuthenticationClient {
  public async getCurrentGamertag() {
    const xstsTicket = await this.getXstsTicket(RelyingParty.Xbox);
    return xstsTicket.DisplayClaims.xui[0].gtg;
  }
}

interface ApiClientsContextValue {
  haloInfiniteClient: HaloInfiniteClient;
  xboxAuthClient: XboxCurrentGamertagAuthenticationClient;
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
  const { acquireOauth2AccessToken, requireInteraction, clearMsalCache } =
    useAuthentication();
  const xboxAuthClient = new XboxCurrentGamertagAuthenticationClient(
    acquireOauth2AccessToken,
    tokenPersister,
    fetcher
  );

  const getXstsTicket = useCallback(
    async (...args: Parameters<XboxAuthenticationClient['getXstsTicket']>) => {
      let xstsTicket: Awaited<
        ReturnType<XboxAuthenticationClient['getXstsTicket']>
      >;
      try {
        xstsTicket = await xboxAuthClient.getXstsTicket(...args);
      } catch (e) {
        if (
          e instanceof Error &&
          isRequestError(e) &&
          e.response.status === 401
        ) {
          try {
            const body: {
              XErr: number;
              Redirect: string;
              Identity: string;
              Message: string;
            } = await e.response.json();

            await clearMsalCache();
            await requireInteraction(
              new XboxLiveError(
                body.Message,
                body.XErr,
                body.Redirect,
                body.Identity
              )
            );
          } catch {}
        }
        throw e;
      }
      return xstsTicket;
    },
    [requireInteraction, clearMsalCache, xboxAuthClient]
  );

  const xboxClient = new XboxClient(
    {
      getXboxLiveV3Token: async () => {
        const xstsTicket = await getXstsTicket(RelyingParty.Xbox);
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
        const xstsTicket = await getXstsTicket(RelyingParty.Halo);
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

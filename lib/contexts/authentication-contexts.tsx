'use client';
import {
  AccountInfo,
  AuthError,
  BrowserAuthError,
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
  ServerError,
} from '@azure/msal-browser';
import { ResolvablePromise } from '@gravllift/utilities';
import { requestPolicy } from '@gravllift/halo-helpers';
import { SeverityLevel } from '@microsoft/applicationinsights-web';
import { RelyingParty } from 'halo-infinite-api';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { appInsights } from '../application-insights/client';
import { fetcher } from '../clients/fetcher';
import { localStorageEvent } from '../local-storage/event-based-localstorage';
import { scopes } from '../msal-instance/scopes';

function getHeaderDict(headers: Headers): Record<string, string> {
  const headerDict: Record<string, string> = {};
  headers.forEach((value: string, key: string) => {
    headerDict[key] = value;
  });
  return headerDict;
}

const msalInstance = new PublicClientApplication({
  auth: {
    clientId: process.env['NEXT_PUBLIC_CLIENT_ID'] ?? '',
    authority: 'https://login.live.com',
    knownAuthorities: ['login.live.com'],
    protocolMode: 'OIDC',
    redirectUri: `${
      typeof window !== 'undefined' ? window.location.origin : ''
    }/oauth2/callback`,
    OIDCOptions: {
      defaultScopes: scopes,
    },
    postLogoutRedirectUri: `${
      typeof window !== 'undefined' ? window.location.origin : ''
    }/oauth2/logout`,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
  },
  system: {
    loggerOptions: {
      piiLoggingEnabled: false,
      logLevel: LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        let severityLevel: SeverityLevel;
        switch (level) {
          case LogLevel.Error:
            severityLevel = SeverityLevel.Error;
            break;
          case LogLevel.Warning:
            severityLevel = SeverityLevel.Warning;
            break;
          case LogLevel.Info:
            severityLevel = SeverityLevel.Information;
            break;
          case LogLevel.Verbose:
            severityLevel = SeverityLevel.Verbose;
            break;
          default:
            severityLevel = SeverityLevel.Information;
        }
        if (!containsPii) {
          appInsights.trackTrace({ severityLevel, message });
        }
      },
    },
    networkClient: {
      async sendGetRequestAsync(url, options) {
        const response = await requestPolicy.execute(() =>
          fetcher(url, { ...options, method: 'GET' })
        );
        return {
          headers: getHeaderDict(response.headers),
          body: await response.json(),
          status: response.status,
        };
      },
      async sendPostRequestAsync(url, options) {
        const response = await requestPolicy.execute(() =>
          fetcher(url, { ...options, method: 'POST' })
        );
        return {
          headers: getHeaderDict(response.headers),
          body: await response.json(),
          status: response.status,
        };
      },
    },
  },
});
const initializePromise = msalInstance
  .initialize()
  .then(() => msalInstance.handleRedirectPromise());

interface AuthenticationContextValue {
  acquireOauth2AccessToken: () => Promise<string>;
  logout: () => Promise<void>;
  interaction: {
    authError?: AuthError;
    resolve: () => Promise<void>;
    abort: (() => void) | undefined;
  } | null;
  msalInstance: {
    getAllAccounts: () => Promise<AccountInfo[]>;
  };
}

const AuthenticationContext = createContext<AuthenticationContextValue | null>(
  null
);

export function useAuthentication(): AuthenticationContextValue {
  const context = useContext(AuthenticationContext);
  if (!context) {
    throw new Error(
      'useAuthentication must be used within an AuthenticationProvider'
    );
  }
  return context;
}

export function AuthenticationProvider({ children }: { children: ReactNode }) {
  const [interaction, setInteraction] =
    useState<AuthenticationContextValue['interaction']>(null);

  const redirect = useCallback(async () => {
    await msalInstance.acquireTokenRedirect({
      scopes,
      redirectUri: `${window.location.origin}/oauth2/callback`,
      state: window.location.pathname + window.location.search,
    });
    return new Promise<never>(() => {});
  }, []);

  const requireInteraction = useCallback(
    (e?: AuthError) => {
      const promise = new ResolvablePromise<never>();
      setInteraction({
        authError: e,
        resolve: async () => {
          await redirect();
        },
        abort: () => {
          setInteraction(null);
          promise.reject(e);
        },
      });
      return promise;
    },
    [setInteraction]
  );

  const tokenPromise = useRef<Promise<string> | null>(null);
  const acquireOauth2AccessToken = useCallback(async (): Promise<string> => {
    let currentPromise = tokenPromise.current;
    if (!currentPromise) {
      currentPromise = (async () => {
        try {
          const maybeRedirectToken = await initializePromise;
          if (maybeRedirectToken?.accessToken) {
            return maybeRedirectToken.accessToken;
          }

          const xboxUserToken = localStorage.getItem(`xbox.userToken`);

          if (!xboxUserToken) {
            // No account in history, ask for permission to redirect
            return await requireInteraction();
          }
          // If an account exists, try to get a token silently
          const token = await msalInstance.acquireTokenSilent({
            scopes,
          });

          return token.accessToken;
        } catch (e) {
          if (
            e instanceof InteractionRequiredAuthError ||
            e instanceof BrowserAuthError
          ) {
            // Account exists, but we need to re-auth. User has already given permission in the past,
            // so we can just redirect.
            return await redirect();
          } else if (e instanceof ServerError) {
            // Something is wrong with our current login state, clear and re-auth
            await msalInstance.clearCache();
            if (e.errorCode === 'access_denied') {
              // User has explicitly revoked our app's access. We need to ask for permission again.
              return await requireInteraction(e);
            } else {
              // Assume user needs to interactively re-authenticate
              appInsights.trackException({ exception: e });
              return await redirect();
            }
          } else {
            throw e;
          }
        }
      })().finally(() => {
        tokenPromise.current = null;
      });
      tokenPromise.current = currentPromise;
    }
    return currentPromise;
  }, []);

  const contextValue: AuthenticationContextValue = {
    interaction,
    acquireOauth2AccessToken,
    logout: async () => {
      appInsights.trackEvent({ name: 'UserLogout' });
      localStorageEvent.removeItem(`xbox.userToken`);
      localStorageEvent.removeItem(`xbox.xstsTicket.${RelyingParty.Halo}`);
      localStorageEvent.removeItem(`xbox.xstsTicket.${RelyingParty.Xbox}`);
      localStorageEvent.removeItem(`halo.authToken`);
      await msalInstance.clearCache();
      await msalInstance.logoutRedirect();
    },
    msalInstance: {
      getAllAccounts: async () => {
        try {
          await initializePromise;
          return msalInstance.getAllAccounts();
        } catch (err) {
          return [];
        }
      },
    },
  };

  return (
    <AuthenticationContext.Provider value={contextValue}>
      {children}
    </AuthenticationContext.Provider>
  );
}

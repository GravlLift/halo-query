'use client';
import type { UserInfo, XboxTicket } from 'halo-infinite-api';
import { RelyingParty } from 'halo-infinite-api';
import { useEffect, useState } from 'react';
import { toaster } from '../../components/ui/toaster';
import { useReadLocalStorage } from '../hooks/local-storage';
import { appInsights } from '../application-insights/client';
import { useApiClients } from '../contexts/api-client-contexts';
import { useAuthentication } from '../contexts/authentication-contexts';
import { EventType } from '@azure/msal-browser';
import { useHaloCaches } from '../contexts/halo-caches-context';

export function useCurrentUserGamertag() {
  const xboxXstsTicket = useReadLocalStorage<XboxTicket>(
    'xbox.xstsTicket.' + RelyingParty.Xbox
  );

  if (xboxXstsTicket) {
    const gamertag = xboxXstsTicket.DisplayClaims.xui[0].gtg as string;
    appInsights.setAuthenticatedUserContext(gamertag.replace(/[,;=| ]+/g, '_'));
    return gamertag;
  } else {
    appInsights.clearAuthenticatedUserContext();
    return xboxXstsTicket;
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState<UserInfo>();
  const { fullUsersCache } = useHaloCaches();
  const { xboxAuthClient } = useApiClients();
  const {
    msalInstance: { getAllAccounts },
  } = useAuthentication();
  const gamertag = useCurrentUserGamertag();

  useEffect(() => {
    if (gamertag) {
      fullUsersCache
        .get(gamertag)
        .then(setUser)
        .catch((e) => {
          toaster.create({
            id: 'user-fetch-error',
            title: 'Error fetching user from Halo Waypoint',
            description: e.message,
            type: 'error',
          });
        });
    } else {
      getAllAccounts().then(async ({ length }) => {
        if (length > 0) {
          try {
            await xboxAuthClient.getCurrentGamertag();
          } catch (e) {
            if (e instanceof Error) {
              toaster.create({
                id: 'user-fetch-error',
                title: 'Error fetching user from Halo Waypoint',
                description: e.message,
                type: 'error',
              });
            }
          }
        }
      });
    }
  }, [gamertag, fullUsersCache, xboxAuthClient]);

  return user;
}

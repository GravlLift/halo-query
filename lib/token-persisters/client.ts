'use client';
import type { TokenPersister } from 'halo-infinite-api';
import { localStorageEvent } from '../local-storage/event-based-localstorage';

export const tokenPersister: TokenPersister = {
  load: (tokenName) => {
    if (typeof localStorage === 'undefined') return null;

    const json = localStorageEvent.getItem(tokenName);
    if (json) {
      try {
        return JSON.parse(json);
      } catch (_) {
        return null;
      }
    } else {
      return null;
    }
  },
  save: (tokenName, token) => {
    localStorageEvent.setItem(tokenName, JSON.stringify(token));
  },
  clear: (tokenName) => {
    localStorageEvent.removeItem(tokenName);
  },
};

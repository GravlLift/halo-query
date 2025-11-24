import { RequestError, UserInfo } from 'halo-infinite-api';
import { useEffect, useState } from 'react';
import { useNavigationController } from '../../components/navigation-context';
import { toaster } from '../../components/ui/toaster';
import { useHaloCaches } from '../contexts/halo-caches-context';
import { isRequestError } from '@gravllift/halo-helpers';

export function useUserData(gamerTag: string | null) {
  const { usersCache } = useHaloCaches();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | { xuid: string }>();
  const { signal: navigationStartSignal } = useNavigationController();
  useEffect(() => {
    (async () => {
      setUser(undefined);
      if (!gamerTag) return;

      setLoading(true);
      try {
        const user = await usersCache.get(gamerTag, navigationStartSignal);
        setUser(user);
      } catch (e) {
        if (
          e instanceof Error &&
          isRequestError(e) &&
          e.response.status === 404
        ) {
          setUser(undefined);
        } else {
          if (e instanceof DOMException && e.name === 'AbortError') {
            // Ignore
          } else if (e instanceof Error) {
            toaster.create({
              id: 'user-fetch-error',
              title: 'Error fetching user',
              description: e.message,
              type: 'error',
            });
          } else {
            throw e;
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [gamerTag, navigationStartSignal]);
  return {
    user:
      user && !('gamertag' in user)
        ? { ...user, gamertag: gamerTag || '' }
        : user,
    loading,
  };
}

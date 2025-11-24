import { isRequestError } from '@gravllift/halo-helpers/src/error-helpers';
import { ServiceRecord } from 'halo-infinite-api';
import { useEffect, useState } from 'react';
import {
  abortErrorCatch,
  useNavigationController,
} from '../../components/navigation-context';
import { useApiClients } from '../contexts/api-client-contexts';
import { waypointXboxRequestPolicy } from '../requestPolicy';

export function useServiceRecord(gamerTag: string | null) {
  const { haloInfiniteClient } = useApiClients();
  const [loading, setLoading] = useState(true);
  const [serviceRecord, setServiceRecord] = useState<ServiceRecord>();
  const { signal: navigationStartSignal } = useNavigationController();

  useEffect(() => {
    setServiceRecord(undefined);
  }, [gamerTag]);
  useEffect(() => {
    (async () => {
      setServiceRecord(undefined);
      if (!gamerTag) return;

      setLoading(true);
      try {
        const res = await waypointXboxRequestPolicy.execute(
          (ctx) =>
            haloInfiniteClient.getUserServiceRecord(gamerTag, undefined, {
              signal: ctx.signal,
            }),
          navigationStartSignal
        );
        setServiceRecord(res);
      } catch (e) {
        if (
          e instanceof Error &&
          isRequestError(e) &&
          e.response.status === 404
        ) {
          setServiceRecord(undefined);
        } else {
          abortErrorCatch(e);
        }
      }
      setLoading(false);
    })();
  }, [gamerTag, navigationStartSignal]);
  return { serviceRecord, loading };
}

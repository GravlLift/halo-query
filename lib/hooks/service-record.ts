import { requestPolicy } from '@gravllift/halo-helpers';
import { RequestError, ServiceRecord } from 'halo-infinite-api';
import { useEffect, useState } from 'react';
import {
  abortErrorCatch,
  useNavigationController,
} from '../../components/navigation-context';
import { useApiClients } from '../contexts/api-client-contexts';

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
        const res = await requestPolicy.execute(
          (ctx) =>
            haloInfiniteClient.getUserServiceRecord(gamerTag, undefined, {
              signal: ctx.signal,
            }),
          navigationStartSignal
        );
        setServiceRecord(res);
      } catch (e) {
        if (e instanceof RequestError && e.response.status === 404) {
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

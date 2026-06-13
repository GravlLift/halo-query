import { AssetVersionLink } from 'halo-infinite-api';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { useHaloCaches } from '../lib/contexts/halo-caches-context';
import { getPlayerEsrA } from '../lib/match-query/player-matches';
import { useNavigationController } from './navigation-context';

export function EsrDisplay(props: {
  playlist: Omit<AssetVersionLink, 'AssetKind'>;
  xuid: string;
  asOf: DateTime;
}) {
  const haloCaches = useHaloCaches();
  const { signal: navigationStartSignal } = useNavigationController();
  const [esrA, setEsrA] = useState<number | null>();
  useEffect(() => {
    getPlayerEsrA(
      props.playlist,
      props.xuid,
      props.asOf,
      navigationStartSignal,
      haloCaches
    ).then((val) => setEsrA(val));
  }, [
    props.playlist,
    props.xuid,
    props.asOf,
    setEsrA,
    navigationStartSignal,
    haloCaches,
  ]);
  return esrA?.toFixed(2);
}

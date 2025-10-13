import { AssetVersionLink } from 'halo-infinite-api';
import { useEffect, useState } from 'react';
import { getPlayerEsrA } from '../lib/match-query/player-matches';
import { DateTime } from 'luxon';
import { useNavigationController } from './navigation-context';
import { useLeaderboard } from './leaderboard-provider/leaderboard-context';
import { useHaloCaches } from '../lib/contexts/halo-caches-context';

export function EsrDisplay(props: {
  playlist: Omit<AssetVersionLink, 'AssetKind'>;
  xuid: string;
  asOf: DateTime;
}) {
  const haloCaches = useHaloCaches();
  const leaderboard = useLeaderboard();
  const { signal: navigationStartSignal } = useNavigationController();
  const [esrA, setEsrA] = useState<number | null>();
  useEffect(() => {
    getPlayerEsrA(
      leaderboard,
      props.playlist,
      props.xuid,
      props.asOf,
      navigationStartSignal,
      haloCaches
    ).then((val) => setEsrA(val));
  }, [
    leaderboard,
    props.playlist,
    props.xuid,
    props.asOf,
    setEsrA,
    navigationStartSignal,
    haloCaches,
  ]);
  return esrA?.toFixed(2);
}

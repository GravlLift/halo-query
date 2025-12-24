import { Box, Link, Skeleton } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { wrapXuid } from '@gravllift/halo-helpers';
import { useNavigationController } from '../navigation-context';

export default function GamertagDisplay({
  player,
  fetchIfMissing,
}: {
  player: { gamertag?: string; PlayerId: string };
  fetchIfMissing?: boolean;
}) {
  const { signal } = useNavigationController();
  const haloCaches = useHaloCaches();
  const [resolvedGamertag, setResolvedGamertag] = useState<string | undefined>(
    player.gamertag
  );

  // Keep local state in sync if parent provides the gamertag
  useEffect(() => {
    if (player.gamertag) {
      setResolvedGamertag(player.gamertag);
    }
  }, [player.gamertag]);

  // Optionally fetch the gamertag if missing and PlayerId is an XUID
  useEffect(() => {
    if (!fetchIfMissing) return;
    if (resolvedGamertag) return;
    if (player.PlayerId?.startsWith('bid')) return; // bots

    const abortController = new AbortController();
    (async () => {
      try {
        const user = await haloCaches.usersCache.get(
          player.PlayerId,
          abortController.signal
        );
        setResolvedGamertag(user.gamertag);
      } catch (err) {
        throw err;
      }
    })();
    return () => {
      abortController.abort();
    };
  }, [fetchIfMissing, resolvedGamertag, player.PlayerId, haloCaches]);

  return (
    <Box w="100%" whiteSpace={['nowrap']}>
      {player.PlayerId?.startsWith('bid') ? (
        <>Bot</>
      ) : resolvedGamertag ? (
        <>
          <Link asChild cursor={'pointer'}>
            <NextLink
              prefetch={false}
              href={'/players/' + resolvedGamertag}
              title={player.PlayerId}
            >
              {resolvedGamertag}
            </NextLink>
          </Link>
        </>
      ) : (
        <Skeleton
          height="20px"
          width="100%"
          minW="100px"
          title={player.PlayerId}
        />
      )}
    </Box>
  );
}

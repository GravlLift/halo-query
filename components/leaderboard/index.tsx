'use client';
import { Box, Flex, Heading, Tabs } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { useCurrentUserGamertag } from '../../lib/hooks/current-user';
import { usePlaylistAssetIds } from '../../lib/leaderboard/hooks';
import { rankedPlaylistAssetId } from '../../lib/ranked-playlist-ids';
import { Loading } from '../loading';
import Testing from '../testing';
import Peers from './peers';
import PlaylistLeaderboard from './playlist-leaderboard';

export default function Leaderboard({
  page,
  gamertag,
  playlistAssetId,
  skillProp,
}: {
  page: string | undefined;
  gamertag: string | undefined;
  playlistAssetId: string | undefined;
  skillProp: 'esr' | 'csr' | undefined;
}) {
  const { playlistCache, playlistVersionCache } = useHaloCaches();
  const router = useRouter();
  const playlistAssetIds = usePlaylistAssetIds();
  const [playlists, setPlaylists] = useState<
    { AssetId: string; PublicName: string }[]
  >([
    {
      AssetId: rankedPlaylistAssetId,
      PublicName: 'Ranked Arena',
    },
    {
      AssetId: 'dcb2e24e-05fb-4390-8076-32a0cdb4326e',
      PublicName: 'Ranked Slayer',
    },
    {
      AssetId: 'fa5aa2a3-2428-4912-a023-e1eeea7b877c',
      PublicName: 'Ranked Doubles',
    },
  ]);
  const { setFocusPlayer } = useFocusPlayer();
  useEffect(() => {
    if (gamertag) {
      setFocusPlayer(gamertag);
    }
  }, [gamertag, setFocusPlayer]);
  const currentUser = useCurrentUserGamertag();
  useEffect(() => {
    if (!currentUser) {
      // Can't fetch playlist details without a logged-in user
      if (
        !playlistAssetId ||
        playlists.some((p) => p.AssetId === playlistAssetId)
      ) {
        // User is not looking for a specific playlist or the playlist is already loaded
        return;
      }
      // User is specifically looking for a playlist that requires login, proceed
    }

    const playlistsToFetch = playlistAssetIds?.filter(
      (id): id is string =>
        typeof id === 'string' && !playlists.some((p) => p.AssetId == id)
    );

    if (playlistsToFetch?.length) {
      Promise.all(
        playlistsToFetch.map((p) =>
          playlistCache.get(p).then((playlist) =>
            playlistVersionCache
              .get({ AssetId: p, VersionId: playlist.UgcPlaylistVersion })
              .then((playlistAsset) => {
                if ('PublicName' in playlistAsset) {
                  setPlaylists((prev) => [
                    ...prev.filter((p2) => p2.AssetId != playlistAsset.AssetId),
                    playlistAsset,
                  ]);
                }
              })
          )
        )
      );
    }
  }, [playlistAssetIds, playlists, currentUser, playlistAssetId]);
  return (
    <Flex justifyContent="center" mt={2}>
      <Box maxW="1000px" width="100%" mx={2}>
        <Flex>
          <Box flexGrow={1}>
            <Box>
              <Heading size="lg">Leaderboard</Heading>
            </Box>
          </Box>
          <Testing>
            <Box flexGrow={1} textAlign="right">
              <Peers />
            </Box>
          </Testing>
        </Flex>
        {playlistAssetId == null ||
        playlists.some((p) => p.AssetId === playlistAssetId) ? (
          <Tabs.Root
            lazyMount
            onValueChange={(e) => {
              const search = new URLSearchParams(window.location.search);
              search.set('playlistAssetId', e.value);
              search.delete('page');
              router.replace(`/leaderboard?${search.toString()}`);
            }}
            defaultValue={playlistAssetId ?? playlists[0].AssetId}
          >
            <Flex
              justifyContent="center"
              borderBottomStyle="solid"
              borderBottomWidth="2px"
              borderBottomColor="inherit"
            >
              <Box maxW="1000px" w="100%">
                <Tabs.List overflow="auto hidden" maxW="1000px" border="0">
                  {playlists.map((p) => (
                    <Tabs.Trigger
                      key={p.AssetId}
                      value={p.AssetId}
                      minW="120px"
                    >
                      {p.PublicName}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Box>
            </Flex>
            {playlists.map(({ AssetId }) => (
              <Tabs.Content key={AssetId} value={AssetId} px={0}>
                <PlaylistLeaderboard
                  playlistAssetId={AssetId}
                  page={page}
                  gamertag={gamertag}
                  skillProp={skillProp}
                />
              </Tabs.Content>
            ))}
          </Tabs.Root>
        ) : (
          <Loading />
        )}
      </Box>
    </Flex>
  );
}

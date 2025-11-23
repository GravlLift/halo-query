'use client';
import {
  Box,
  Center,
  Flex,
  Heading,
  Link,
  Menu,
  Portal,
  Tabs,
  Text,
} from '@chakra-ui/react';
import {
  compareXuids,
  getTierSubTierForSkill,
  requestPolicy,
  wrapXuid,
} from '@gravllift/halo-helpers';
import {
  BanSummary,
  Playlist,
  PlaylistAsset,
  PlaylistCsrContainer,
  ServiceRecord,
} from 'halo-infinite-api';
import { ExternalLink } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { MemoryCache } from '../../../../libs/utilities/src';
import { useApiClients } from '../../lib/contexts/api-client-contexts';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { useServiceRecord } from '../../lib/hooks/service-record';
import { useUserData } from '../../lib/hooks/user-data';
import { nextRedirectRejectionHandler } from '../../lib/match-query/promise-helpers';
import { Loading } from '../loading';
import { useNavigationController } from '../navigation-context';
import { VerticalCenter } from '../vertical-center';
import { PlaylistTabContent } from './playlist-tab-content';

function usePlaylists(
  serviceRecord: ServiceRecord | undefined,
  userInfo: { xuid: string } | undefined
) {
  const { playlistCache, playlistVersionCache } = useHaloCaches();
  const { haloInfiniteClient } = useApiClients();
  const seasonCache = useMemo(
    () =>
      new MemoryCache<
        PlaylistCsrContainer | null,
        { xuid: string; playlistId: string; seasonId: string },
        string
      >({
        cacheExpirationMs: 15 * 1000,
        fetchOneFn: async ({ playlistId, seasonId, xuid }, signal) => {
          return await requestPolicy
            .execute(
              (ctx) =>
                haloInfiniteClient.getPlaylistCsr(
                  playlistId,
                  [xuid],
                  seasonId,
                  {
                    signal: ctx.signal,
                  }
                ),
              signal
            )
            .then((r) => r[0].Result)
            .catch(() => null);
        },
        keyTransformer: ({ xuid, playlistId, seasonId }) =>
          `${xuid}-${playlistId}-${seasonId}`,
      }),
    [haloInfiniteClient]
  );

  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<
    {
      playlistId: string;
      csr: PlaylistCsrContainer;
      playlistInfo: Playlist;
      playlistAsset: PlaylistAsset;
    }[]
  >([]);
  const { signal: navigationStartSignal } = useNavigationController();
  useEffect(() => {
    setPlaylists([]);
  }, [serviceRecord, userInfo]);
  useEffect(() => {
    (async () => {
      if (!userInfo?.xuid) return;

      setLoading(true);
      const playlistIds = serviceRecord?.Subqueries.PlaylistAssetIds ?? [];
      await Promise.allSettled(
        playlistIds.map(async (playlistId) => {
          const playlistInfo = await playlistCache.get(
            playlistId,
            navigationStartSignal
          );
          if (playlistInfo.HasCsr) {
            const serviceCalendar = await requestPolicy.execute(
              (ctx) =>
                haloInfiniteClient.getSeasonCalendar({
                  signal: ctx.signal,
                }),
              navigationStartSignal
            );
            const [lifetimeCsr, playlistAsset, ...seasonCsrs] =
              await Promise.allSettled([
                requestPolicy
                  .execute(
                    (ctx) =>
                      haloInfiniteClient.getPlaylistCsr(
                        playlistId,
                        [userInfo.xuid],
                        undefined,
                        {
                          signal: ctx.signal,
                        }
                      ),
                    navigationStartSignal
                  )
                  .then((r) => r[0].Result),
                playlistVersionCache.get(
                  {
                    AssetId: playlistId,
                    VersionId: playlistInfo.UgcPlaylistVersion,
                  },
                  navigationStartSignal
                ),
                ...serviceCalendar.Seasons.filter(
                  (s) => s.CsrSeasonFilePath !== 'Csr/Seasons/CsrSeason1-2.json'
                ).map(({ CsrSeasonFilePath }) => {
                  const seasonId = /\/([^/]+).json$/.exec(
                    CsrSeasonFilePath
                  )?.[1];
                  if (!seasonId) {
                    throw new Error(
                      `Failed to parse season id from ${CsrSeasonFilePath}`
                    );
                  }
                  return seasonCache.get(
                    {
                      playlistId,
                      seasonId,
                      xuid: userInfo.xuid,
                    },
                    navigationStartSignal
                  );
                }),
              ]).then(nextRedirectRejectionHandler);

            const validSeasonCsrs = seasonCsrs.filter((s) => s != null);
            if (validSeasonCsrs.length > 0) {
              lifetimeCsr.AllTimeMax = validSeasonCsrs
                .map((s) => s.SeasonMax)
                .maxBy((seasonMax) => seasonMax.Value);
            }

            setPlaylists((current) => {
              const existingIndex = current.findIndex(
                (p) => p.playlistId === playlistId
              );
              if (existingIndex == -1) {
                return [
                  ...current,
                  {
                    playlistId,
                    csr: lifetimeCsr,
                    playlistInfo,
                    playlistAsset: playlistAsset as PlaylistAsset,
                  },
                ];
              } else {
                const clone = [...current];
                clone[existingIndex] = {
                  playlistId,
                  csr: lifetimeCsr,
                  playlistInfo,
                  playlistAsset: playlistAsset as PlaylistAsset,
                };
                return clone;
              }
            });
          }
        })
      );
      setLoading(false);
    })();
  }, [serviceRecord, userInfo, navigationStartSignal]);
  return {
    playlists: playlists.sortBy((p) => {
      const order = ['Ranked Arena', 'Ranked Doubles'].indexOf(
        p.playlistAsset.PublicName
      );
      if (order === -1) {
        return Number.MAX_SAFE_INTEGER;
      }
      return order;
    }),
    loading,
    updateCsr: (playlistId: string, newCsr: number) => {
      setPlaylists((current) => {
        const existingIndex = current.findIndex(
          (p) => p.playlistId === playlistId
        );
        if (existingIndex == -1) {
          return current;
        } else {
          const clone = [...current];
          const allTimeMax = Math.max(
            newCsr,
            clone[existingIndex].csr.AllTimeMax.Value
          );
          const allTimeMaxTierInfo = getTierSubTierForSkill(allTimeMax);
          const seasonMax = Math.max(
            newCsr,
            clone[existingIndex].csr.SeasonMax.Value
          );
          const seasonMaxTierInfo = getTierSubTierForSkill(seasonMax);
          const newCsrTierInfo = getTierSubTierForSkill(newCsr);
          clone[existingIndex] = {
            ...clone[existingIndex],
            csr: {
              AllTimeMax: {
                ...clone[existingIndex].csr.AllTimeMax,
                Value: allTimeMax,
                Tier: allTimeMaxTierInfo.Tier,
                SubTier: allTimeMaxTierInfo.SubTier,
              },
              SeasonMax: {
                ...clone[existingIndex].csr.SeasonMax,
                Value: seasonMax,
                Tier: seasonMaxTierInfo.Tier,
                SubTier: seasonMaxTierInfo.SubTier,
              },
              Current: {
                ...clone[existingIndex].csr.Current,
                Value: newCsr,
                Tier: newCsrTierInfo.Tier,
                SubTier: newCsrTierInfo.SubTier,
              },
            },
          };
          return clone;
        }
      });
    },
  };
}

export default function PlayerProfile({ gamerTag }: { gamerTag: string }) {
  const { haloInfiniteClient } = useApiClients();
  const { setFocusPlayer } = useFocusPlayer();
  useEffect(() => {
    setFocusPlayer(gamerTag);
  }, [gamerTag, setFocusPlayer]);
  const { user, loading: userLoading } = useUserData(gamerTag);
  useEffect(() => {
    document.title = `${
      (user && 'gamertag' in user && user.gamertag) || gamerTag
    } | Halo Query`;
  }, [gamerTag, user]);
  const { serviceRecord, loading: serviceRecordLoading } = useServiceRecord(
    user ? wrapXuid(user.xuid) : null
  );
  const {
    playlists,
    loading: playlistCsrsLoading,
    updateCsr,
  } = usePlaylists(serviceRecord, user);
  const profileGamertag = user && 'gamertag' in user ? user.gamertag : gamerTag;

  const [bans, setBans] = useState<
    BanSummary['Results'][number]['Result']['BansInEffect']
  >([]);
  useEffect(() => {
    if (user?.xuid) {
      haloInfiniteClient.getBanSummary([user.xuid]).then((result) => {
        setBans(
          result.Results[0].Result.BansInEffect.filter(
            (ban) =>
              DateTime.fromISO(ban.EnforceUntilUtc.ISO8601Date) > DateTime.utc()
          )
        );
      });
    }
  }, [user?.xuid]);

  return (
    <>
      <Flex justifyContent="center">
        <Box maxW="1000px" w="100%">
          <Flex p={2} gap={2}>
            <Box flexGrow={1}>
              <Heading size="lg" data-xuid={user?.xuid}>
                {profileGamertag}
              </Heading>
              {bans.length > 0 && (
                <Text
                  color="red.400"
                  fontWeight="bold"
                  fontSize="xs"
                  textTransform="uppercase"
                >
                  Banned until{' '}
                  {bans
                    .reduce((latest, ban) => {
                      const banEnd = DateTime.fromISO(
                        ban.EnforceUntilUtc.ISO8601Date
                      );
                      return banEnd > latest ? banEnd : latest;
                    }, DateTime.fromMillis(0))
                    .toLocaleString(DateTime.DATETIME_SHORT)}
                </Text>
              )}
            </Box>
            <VerticalCenter>
              <Menu.Root>
                <Menu.Trigger as={Link} aria-label="External Links">
                  <Text hideBelow="sm">External Profile Links</Text>
                  <ExternalLink />
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.Item asChild value="Halo Waypoint">
                        <Link
                          target="_blank"
                          href={`https://www.halowaypoint.com/halo-infinite/players/${profileGamertag}`}
                        >
                          Halo Waypoint
                        </Link>
                      </Menu.Item>
                      <Menu.Item asChild value="Halo Tracker">
                        <Link
                          target="_blank"
                          href={`https://halotracker.com/halo-infinite/profile/xbl/${profileGamertag}/overview`}
                        >
                          Halo Tracker
                        </Link>
                      </Menu.Item>
                      <Menu.Item asChild value="Halo Data Hive">
                        <Link
                          target="_blank"
                          href={`https://halodatahive.com/Player/Infinite/${profileGamertag}`}
                        >
                          Halo Data Hive
                        </Link>
                      </Menu.Item>
                      <Menu.Item asChild value="Leaf App">
                        <Link
                          target="_blank"
                          href={`https://leafapp.co/player/${profileGamertag}`}
                        >
                          Leaf App
                        </Link>
                      </Menu.Item>
                      <Menu.Item asChild value="Spartan Record">
                        <Link
                          target="_blank"
                          href={`https://spartanrecord.com/service_record/${profileGamertag}`}
                        >
                          Spartan Record
                        </Link>
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            </VerticalCenter>
          </Flex>
        </Box>
      </Flex>
      {userLoading || serviceRecordLoading || playlistCsrsLoading ? (
        <Loading centerProps={{ minH: '200px' }} />
      ) : user == null ? (
        <Center>Unable to find user with gamertag {gamerTag}</Center>
      ) : playlists.length === 0 ? (
        <Center>
          Gamertag {gamerTag} was located, but no ranked history could be found.
        </Center>
      ) : (
        <Tabs.Root lazyMount defaultValue={playlists[0].playlistId}>
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
                    key={p.playlistId}
                    value={p.playlistId}
                    minW="120px"
                  >
                    {p.playlistAsset.PublicName}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Box>
          </Flex>
          {user &&
            playlists.map((p) => (
              <PlaylistTabContent
                key={p.playlistId}
                user={user}
                playlist={p}
                newLatestMatch={(m) => {
                  const playerStats = m.MatchStats.Players.find((p) =>
                    compareXuids(p.PlayerId, user.xuid)
                  );
                  if (
                    playerStats?.Skill &&
                    playerStats.Skill.RankRecap.PostMatchCsr.Value >= 0
                  ) {
                    updateCsr(
                      p.playlistId,
                      playerStats.Skill.RankRecap.PostMatchCsr.Value
                    );
                  }
                }}
              />
            ))}
        </Tabs.Root>
      )}
    </>
  );
}

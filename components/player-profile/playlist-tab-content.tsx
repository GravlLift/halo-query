import {
  Box,
  Card,
  Center,
  Flex,
  HStack,
  Heading,
  HoverCard,
  Icon,
  IconButton,
  Image,
  Link,
  Portal,
  Select,
  SimpleGrid,
  Spacer,
  Stat,
  Switch,
  Tabs,
  Text,
  VStack,
  createListCollection,
  useBreakpointValue,
} from '@chakra-ui/react';
import {
  PlayerMatchHistoryStatsSkill,
  divisionImageSrc,
  getTierSubTierForSkill,
  skillRankCombined,
} from '@gravllift/halo-helpers';
import {
  MatchSkill,
  Playlist,
  PlaylistAsset,
  PlaylistCsrContainer,
  Stats,
} from 'halo-infinite-api';
import { CircleHelp, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FaRedo, FaSearchPlus } from 'react-icons/fa';
import { compareXuids, wrapXuid } from '@gravllift/halo-helpers';
import { useColors } from '../../lib/hooks/colors';
import { useLocalStorage } from '../../lib/hooks/local-storage';
import { getPlayerMatches } from '../../lib/match-query/player-matches';
import { getLocalStorageValueOrDefault } from '../../lib/next-local-storage';
import { getObjectivePoints } from '../../lib/stats/objective-points';
import { useLeaderboard } from '../leaderboard-provider/leaderboard-context';
import { Loading } from '../loading';
import {
  abortErrorCatch,
  useNavigationController,
} from '../navigation-context';
import RoleGraph from '../role-graph';
import type { CsrRewardChartProps } from './csr-reward-chart';
import { PlaylistCsrDisplay } from './playlist-csr-display';
import PlaylistSkillRankByModeChart, {
  PlaylistSkillRankByModeChartProps,
} from './skill-rank-chart/playlist-skill-rank-by-mode-chart';
import PlaylistSkillRankChart, {
  PlaylistSkillRankChartProps,
} from './skill-rank-chart/playlist-skill-rank-chart';
import { WinRateTable } from './win-rate-table';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { TeammatesTable } from './teammates-table';
import { Duration } from 'luxon';

const maxMatches: number = +getLocalStorageValueOrDefault(
  'SKILL_CHART_MAX',
  '200',
);

function useMatches(
  user: { xuid: string; gamertag: string },
  playlistAssetId: string,
  navigationStartSignal: AbortSignal,
) {
  const haloCaches = useHaloCaches();
  const leaderboard = useLeaderboard();
  const [matches, setMatches] = useState<PlayerMatchHistoryStatsSkill[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setMatches([]);
  }, [user.xuid, playlistAssetId]);
  const { iterator: matchGenerator } = useMemo(
    () =>
      getPlayerMatches(
        leaderboard,
        [wrapXuid(user.xuid)],
        {
          limit: maxMatches,
          countCutoff: Math.max(maxMatches, 1000),
          fastFilter: (m) => m.MatchInfo.Playlist?.AssetId === playlistAssetId,
          signal: navigationStartSignal,
          loadUserData: false,
        },
        haloCaches,
      ),
    [leaderboard, user.xuid, playlistAssetId, navigationStartSignal],
  );

  useEffect(() => {
    async function fetchFn() {
      setLoading(true);
      try {
        for await (const match of matchGenerator) {
          setMatches((matches) =>
            [
              match,
              ...matches.filter((m) => m.MatchId !== match.MatchId),
            ].slice(0, maxMatches),
          );
        }
      } catch (e) {
        abortErrorCatch(e);
      } finally {
        setLoading(false);
      }
    }
    fetchFn();
  }, [matchGenerator]);

  return { matches, loading, setMatches, setLoading };
}

export function PlaylistTabContent({
  user,
  playlist,
  newLatestMatch,
}: {
  user: { xuid: string; gamertag: string };
  playlist: {
    playlistId: string;
    csr: PlaylistCsrContainer;
    playlistInfo: Playlist;
    playlistAsset: PlaylistAsset;
  };
  newLatestMatch: (match: PlayerMatchHistoryStatsSkill) => void;
}) {
  const leaderboard = useLeaderboard();
  const haloCaches = useHaloCaches();
  const { signal: navigationStartSignal } = useNavigationController();
  const [showLastXGames, setShowLastXGames] = useLocalStorage<number | 'all'>(
    'lastXGamesProfile',
    100,
  );
  const {
    matches: playlistMatches,
    loading: matchesLoading,
    setMatches,
    setLoading,
  } = useMatches(user, playlist.playlistAsset.AssetId, navigationStartSignal);
  const zooms = createListCollection({
    items: [
      ...[10, 20, 50, 100].map((v) => ({
        label: `Last ${v} games`,
        value: v,
      })),
      {
        label: `Show All (${playlistMatches.length})`,
        value: 'all' as const,
      },
    ],
  });
  const matchSkills = playlistMatches
    .map((m) => {
      const player = m.MatchStats.Players.find((p) =>
        compareXuids(p.PlayerId, user.xuid),
      );
      if (!player) {
        throw new Error('Player not found in match stats');
      }
      return {
        matchId: m.MatchId,
        matchStart: m.MatchInfo.StartTime,
        matchEnd: m.MatchInfo.EndTime,
        outcome: player.Outcome,
        duration: Duration.fromISO(
          player.ParticipationInfo.TimePlayed ||
            m.MatchInfo.PlayableDuration ||
            m.MatchInfo.Duration,
        ),
        gameVariantName:
          'PublicName' in m.MatchInfo.UgcGameVariant
            ? m.MatchInfo.UgcGameVariant.PublicName
            : m.MatchInfo.UgcGameVariant.AssetId,
        mapName:
          'PublicName' in m.MatchInfo.MapVariant
            ? m.MatchInfo.MapVariant.PublicName
            : m.MatchInfo.MapVariant.AssetId,
        skill: player?.Skill as MatchSkill,
        teamSkills: m.MatchStats.Players.filter(
          (p) => p.LastTeamId === player?.LastTeamId,
        ).map((p) => p.Skill),
        enemySkills: m.MatchStats.Players.filter(
          (p) => p.LastTeamId !== player?.LastTeamId,
        ).map((p) => p.Skill),
        allFinished: m.MatchStats.Players.every(
          (p) => p.ParticipationInfo.PresentAtCompletion,
        ),
      } satisfies (PlaylistSkillRankChartProps &
        PlaylistSkillRankByModeChartProps &
        CsrRewardChartProps)['skills'][number];
    })
    .filter(
      (
        s,
      ): s is (PlaylistSkillRankChartProps &
        PlaylistSkillRankByModeChartProps &
        CsrRewardChartProps)['skills'][number] =>
        s.skill != null &&
        'Bronze' in s.skill.Counterfactuals.TierCounterfactuals,
    );

  const esr: number | undefined = Array.from(
    matchSkills
      .map((v) => [v, skillRankCombined(v.skill, 'Expected')] as const)
      .filter(([, m]) => m != null)
      .sortBy(([m]) => m.matchStart)
      .groupBy(([s]) => s.gameVariantName),
  )
    .map(([, v]) => v[v.length - 1][1])
    .average();
  const esrTierSubtier: { Tier: string; SubTier: number } | undefined =
    getTierSubTierForSkill(esr);

  const matchAggregate = playlistMatches
    .sortByDesc((m) => m.MatchInfo.EndTime)
    .map((m) => {
      const player = m.MatchStats.Players.find((p) =>
        compareXuids(user.xuid, p.PlayerId),
      );
      const playerTeamStats = player?.PlayerTeamStats.find(
        (pts) => pts.TeamId === player.LastTeamId,
      )?.Stats;

      const teamStats = m.MatchStats.Players.filter(
        (p) => p.LastTeamId === player?.LastTeamId,
      ).map(
        (p) =>
          p.PlayerTeamStats.find((pts) => pts.TeamId === player?.LastTeamId)
            ?.Stats,
      );
      const teamObjectiveStats = teamStats
        .map((ts) =>
          getObjectivePoints(m.MatchInfo.GameVariantCategory, ts as Stats),
        )
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      return {
        outcome: player?.Outcome,
        mapName:
          'PublicName' in m.MatchInfo.MapVariant
            ? m.MatchInfo.MapVariant.PublicName
            : m.MatchInfo.MapVariant.AssetId,
        gameVariantName:
          'PublicName' in m.MatchInfo.UgcGameVariant
            ? m.MatchInfo.UgcGameVariant.PublicName
            : m.MatchInfo.UgcGameVariant.AssetId,
        kills: {
          player: playerTeamStats?.CoreStats.Kills ?? 0,
          team: teamStats.sum((ts) => ts?.CoreStats.Kills ?? 0),
        },
        damage: {
          player: playerTeamStats?.CoreStats.DamageDealt ?? 0,
          team: teamStats.sum((ts) => ts?.CoreStats.DamageDealt ?? 0),
        },
        assists: {
          player: playerTeamStats?.CoreStats.Assists ?? 0,
          team: teamStats.sum((ts) => ts?.CoreStats.Assists ?? 0),
        },
        objective: playerTeamStats
          ? {
              player: getObjectivePoints(
                m.MatchInfo.GameVariantCategory,
                playerTeamStats,
              ),
              team: teamObjectiveStats.length
                ? teamObjectiveStats.sum()
                : undefined,
            }
          : undefined,
      };
    });
  const slicedMatchAggregate = useMemo(
    () =>
      matchAggregate.slice(
        0,
        showLastXGames === 'all' ? undefined : showLastXGames,
      ),
    [matchAggregate, showLastXGames],
  );

  const slicedPlaylistMatches = useMemo(
    () =>
      playlistMatches
        .sortByDesc((m) => m.MatchInfo.EndTime)
        .slice(0, showLastXGames === 'all' ? undefined : showLastXGames),
    [playlistMatches, showLastXGames],
  );

  const colors = useColors();
  const chartGridMinChildWidth = useBreakpointValue({
    base: '100%',
    md:
      matchSkills.length > 200 && showLastXGames == 'all' ? undefined : '600px',
  });
  const radiusMax = playlist.playlistAsset.CustomData?.MaxTeamSize
    ? Math.min(
        1,
        1 / playlist.playlistAsset.CustomData.MaxTeamSize +
          0.5 / playlist.playlistAsset.CustomData.MaxTeamSize,
      )
    : undefined;
  const matchAggregateByGameVariant = slicedMatchAggregate.groupBy(
    (m) => m.gameVariantName,
  );

  const [showCsrDeltas, setShowCsrDeltas] = useState<boolean>(false);
  const skillWidth = 140;
  return (
    <Tabs.Content value={playlist.playlistId}>
      <VStack gap={2} align={'stretch'}>
        <Card.Root overflow="hidden" variant="outline" size="sm">
          <Card.Body>
            <Flex
              flexWrap="wrap"
              justifyContent={'space-around'}
              alignItems={'flex-start'}
              direction={'row'}
              w="100%"
              gap={2}
            >
              <Box minW={`${skillWidth}px`}>
                <PlaylistCsrDisplay
                  label="Current CSR"
                  playlistCsr={playlist.csr.Current}
                />
              </Box>
              <Box minW={`${skillWidth}px`}>
                <PlaylistCsrDisplay
                  label="Season Peak CSR"
                  playlistCsr={playlist.csr.SeasonMax}
                />
              </Box>
              <Box minW={`${skillWidth}px`}>
                <Stat.Root>
                  <Stat.Label>
                    <HStack>
                      <Box>All Time Peak CSR</Box>
                      <HoverCard.Root positioning={{ placement: 'top' }}>
                        <HoverCard.Trigger>
                          <CircleHelp />
                        </HoverCard.Trigger>
                        <Portal>
                          <HoverCard.Positioner>
                            <HoverCard.Content>
                              <HoverCard.Arrow />
                              <Text className="paragraph">
                                <Link
                                  target="_blank"
                                  href="https://www.halowaypoint.com/news/halo-infinite-playlist-challenge-update"
                                >
                                  Season 1 CSR excluded due to rank inflation.
                                  <ExternalLink />
                                </Link>
                              </Text>
                            </HoverCard.Content>
                          </HoverCard.Positioner>
                        </Portal>
                      </HoverCard.Root>
                    </HStack>
                  </Stat.Label>
                  <HStack>
                    <Image
                      objectFit="contain"
                      maxW={'25px'}
                      src={divisionImageSrc(playlist.csr.AllTimeMax)}
                      alt={`${playlist.csr.AllTimeMax.Tier} ${
                        playlist.csr.AllTimeMax.SubTier + 1
                      }`}
                    />

                    <Flex flexDir={'column'}>
                      <Spacer />
                      <Stat.ValueText>
                        {playlist.csr.AllTimeMax.Value.toFixed(0)}
                      </Stat.ValueText>
                      <Spacer />
                    </Flex>
                  </HStack>
                  <Stat.HelpText>
                    {playlist.csr.AllTimeMax.Tier}
                    {playlist.csr.AllTimeMax.Tier === 'Onyx'
                      ? ''
                      : ` ${playlist.csr.AllTimeMax.SubTier + 1}`}
                  </Stat.HelpText>
                </Stat.Root>
              </Box>
              {esr ? (
                <Box minW={`${skillWidth}px`}>
                  <Stat.Root>
                    <Stat.Label>
                      <HStack>
                        <Box>ESR Average</Box>
                        <HoverCard.Root>
                          <HoverCard.Trigger>
                            <CircleHelp />
                          </HoverCard.Trigger>
                          <Portal>
                            <HoverCard.Positioner>
                              <HoverCard.Content>
                                <HoverCard.Arrow />
                                <Text className="paragraph">
                                  Expected Skill Rank, or ESR, is a measure of
                                  your skill rank based on the kills and deaths
                                  that Halo Infinite expects you to accumulate
                                  in a match.
                                </Text>
                                <Text className="paragraph">
                                  You have a specific ESR value for each game
                                  type. This number shown is an average of your
                                  most recent ESRs from each game type, and is
                                  labeled in the charts below as ESR-A.
                                </Text>
                              </HoverCard.Content>
                            </HoverCard.Positioner>
                          </Portal>
                        </HoverCard.Root>
                      </HStack>
                    </Stat.Label>
                    <HStack>
                      {esrTierSubtier && (
                        <Image
                          objectFit="contain"
                          maxW={'25px'}
                          src={divisionImageSrc(esrTierSubtier)}
                          alt={`${esrTierSubtier.Tier} ${
                            esrTierSubtier.SubTier + 1
                          }`}
                        />
                      )}
                      <Flex flexDir={'column'} title={esr.toFixed(3)}>
                        <Spacer />
                        <Stat.ValueText>
                          {Math.floor(esr).toFixed(0)}
                        </Stat.ValueText>
                        <Spacer />
                      </Flex>
                    </HStack>
                    {esrTierSubtier && (
                      <Stat.HelpText>
                        {esrTierSubtier.Tier}
                        {esrTierSubtier.Tier === 'Onyx'
                          ? ''
                          : ` ${esrTierSubtier.SubTier + 1}`}
                      </Stat.HelpText>
                    )}
                  </Stat.Root>
                </Box>
              ) : null}
            </Flex>
          </Card.Body>
        </Card.Root>
        <Flex>
          <Spacer />
          <Box>
            <Select.Root
              width="180px"
              size={'sm'}
              value={[showLastXGames?.toString() ?? '100']}
              onValueChange={(e) => {
                if (e.value[0] === 'all') {
                  setShowLastXGames('all');
                } else {
                  setShowLastXGames(parseInt(e.value[0]));
                }
              }}
              collection={zooms}
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText>
                    <Icon as={FaSearchPlus} mr={2} mb="2px" />
                    {zooms.items.find((i) => i.value === showLastXGames)?.label}
                  </Select.ValueText>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    {zooms.items.map((v) => (
                      <Select.Item item={v} key={v.value}>
                        {v.label}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </Box>
          <Box ml={2}>
            <IconButton
              aria-label="Refresh"
              title="Refresh"
              loading={matchesLoading}
              onClick={async () => {
                setLoading(true);
                try {
                  const { iterator } = getPlayerMatches(
                    leaderboard,
                    [wrapXuid(user.xuid)],
                    {
                      limit: maxMatches,
                      countCutoff: Math.max(maxMatches, 1000),
                      fastFilter: (m) =>
                        m.MatchInfo.Playlist?.AssetId ===
                        playlist.playlistAsset.AssetId,
                      signal: navigationStartSignal,
                      loadUserData: false,
                    },
                    haloCaches,
                  );
                  let first = true;
                  for await (const match of iterator) {
                    if (
                      !playlistMatches.some((m) => m.MatchId === match.MatchId)
                    ) {
                      if (first) {
                        first = false;
                        newLatestMatch(match);
                      }
                      setMatches((matches) =>
                        [
                          ...matches.filter((m) => m.MatchId !== match.MatchId),
                          match,
                        ].slice(-maxMatches),
                      );
                    } else {
                      return;
                    }
                  }
                } finally {
                  setLoading(false);
                }
              }}
              size="sm"
            >
              <Icon as={FaRedo} />
            </IconButton>
          </Box>
        </Flex>
        <SimpleGrid minChildWidth={chartGridMinChildWidth} gap={2}>
          <Card.Root flex={1}>
            <Card.Header>
              <Flex>
                <Box flexGrow={1}>
                  <Heading size="md">Skill History</Heading>
                </Box>
                <Box>
                  <Switch.Root
                    display="flex"
                    alignItems="center"
                    justifyContent={'flex-end'}
                    checked={showCsrDeltas}
                    onCheckedChange={(e) => setShowCsrDeltas(e.checked)}
                  >
                    <Switch.HiddenInput />
                    <Switch.Label mb={0}>
                      <Text fontWeight={'normal'} fontSize={'16px'}>
                        Show CSR Deltas
                      </Text>
                    </Switch.Label>
                    <Switch.Control />
                  </Switch.Root>
                </Box>
              </Flex>
            </Card.Header>
            <Card.Body>
              {matchesLoading && matchSkills.length === 0 ? (
                <Loading centerProps={{ height: '400px' }} />
              ) : (
                <PlaylistSkillRankChart
                  target={user}
                  skills={matchSkills}
                  showLastXGames={
                    showLastXGames === 'all' ? null : showLastXGames
                  }
                  showCsrDeltas={showCsrDeltas}
                  isLoading={matchesLoading}
                />
              )}
            </Card.Body>
          </Card.Root>
          <Card.Root flex={1}>
            <Card.Header>
              <Heading size="md">Expected Skill Rank by Mode</Heading>
            </Card.Header>
            <Card.Body>
              {matchesLoading && matchSkills.length === 0 ? (
                <Loading centerProps={{ height: '400px' }} />
              ) : (
                <PlaylistSkillRankByModeChart
                  skills={matchSkills}
                  showLastXGames={
                    showLastXGames === 'all' ? null : showLastXGames
                  }
                />
              )}
            </Card.Body>
          </Card.Root>
        </SimpleGrid>
        <Card.Root>
          <Card.Header>
            <Heading size="md">Roles</Heading>
          </Card.Header>
          <Card.Body>
            {matchesLoading && slicedMatchAggregate.length === 0 ? (
              <Loading centerProps={{ height: '300px' }} />
            ) : (
              <>
                {matchAggregateByGameVariant.size > 1 ? (
                  <Box>
                    <Center>Overall</Center>
                    <RoleGraph
                      radiusMax={radiusMax}
                      height={200}
                      stats={[
                        {
                          gamertag: user.gamertag,
                          kills: slicedMatchAggregate.average((a) =>
                            a.kills.team === 0
                              ? 0
                              : a.kills.player / a.kills.team,
                          ),
                          assists: slicedMatchAggregate.average((a) =>
                            a.assists.team === 0
                              ? 0
                              : a.assists.player / a.assists.team,
                          ),
                          damage: slicedMatchAggregate.find(
                            (ma) =>
                              ma.objective?.player != null &&
                              typeof ma.objective.team === 'number',
                          )
                            ? undefined
                            : slicedMatchAggregate
                                .filter(
                                  (
                                    a,
                                  ): a is typeof a & {
                                    damage: { player: number; team: number };
                                  } =>
                                    a.damage?.player != null &&
                                    typeof a.damage.team === 'number',
                                )
                                .average((a) =>
                                  a.damage.team === 0
                                    ? 0
                                    : a.damage.player / a.damage.team,
                                ),
                          objective: slicedMatchAggregate.find(
                            (ma) =>
                              ma.objective?.player != null &&
                              typeof ma.objective.team === 'number',
                          )
                            ? slicedMatchAggregate
                                .filter(
                                  (
                                    a,
                                  ): a is typeof a & {
                                    objective: {
                                      player: number;
                                      team: number;
                                    };
                                  } =>
                                    a.objective?.player != null &&
                                    typeof a.objective.team === 'number',
                                )
                                .average((a) =>
                                  a.objective.team === 0
                                    ? 0
                                    : a.objective.player / a.objective.team,
                                )
                            : undefined,
                        },
                      ]}
                      colorOverrides={[colors[0]]}
                    />
                  </Box>
                ) : null}
                <Flex justifyContent="center" wrap={'wrap'}>
                  {Array.from(matchAggregateByGameVariant.entries())
                    .sortBy(([gv]) => gv)
                    .map(([gameVariant, matchAggregates], i) => {
                      const objectiveAggregates = matchAggregates.filter(
                        (
                          a,
                        ): a is typeof a & {
                          objective: { player: number; team: number };
                        } =>
                          a.objective?.player != null &&
                          typeof a.objective.team === 'number',
                      );
                      return (
                        <VStack key={gameVariant}>
                          <Box>{gameVariant}</Box>
                          <RoleGraph
                            radiusMax={radiusMax}
                            stats={[
                              {
                                gamertag: user.gamertag,
                                kills: matchAggregates.average((a) =>
                                  a.kills.team === 0
                                    ? 0
                                    : a.kills.player / a.kills.team,
                                ),
                                assists: matchAggregates.average((a) =>
                                  a.assists.team === 0
                                    ? 0
                                    : a.assists.player / a.assists.team,
                                ),
                                damage:
                                  objectiveAggregates.length === 0
                                    ? matchAggregates
                                        .filter(
                                          (
                                            a,
                                          ): a is typeof a & {
                                            damage: {
                                              player: number;
                                              team: number;
                                            };
                                          } =>
                                            a.damage?.player != null &&
                                            typeof a.damage.team === 'number',
                                        )
                                        .average((a) =>
                                          a.damage.team === 0
                                            ? 0
                                            : a.damage.player / a.damage.team,
                                        )
                                    : undefined,
                                objective:
                                  objectiveAggregates.length > 0
                                    ? objectiveAggregates.average((a) =>
                                        a.objective.team === 0
                                          ? 0
                                          : a.objective.player /
                                            a.objective.team,
                                      )
                                    : undefined,
                              },
                            ]}
                            colorOverrides={[colors[i + 1]]}
                          />
                        </VStack>
                      );
                    })}
                </Flex>
              </>
            )}
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Heading size="md">Win Rates</Heading>
          </Card.Header>
          <Card.Body>
            <Center>
              {matchesLoading && slicedMatchAggregate.length === 0 ? (
                <Loading centerProps={{ height: '300px' }} />
              ) : (
                <Box overflowX="auto" w="100%">
                  <WinRateTable
                    matches={slicedMatchAggregate}
                    playlistName={playlist.playlistAsset.PublicName}
                  />
                </Box>
              )}
            </Center>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Heading size="md">Teammates</Heading>
          </Card.Header>
          <Card.Body>
            <Center>
              {matchesLoading && slicedPlaylistMatches.length === 0 ? (
                <Loading centerProps={{ height: '300px' }} />
              ) : (
                <Box overflowX="auto" w="100%">
                  <TeammatesTable
                    matches={slicedPlaylistMatches}
                    userXuid={user.xuid}
                  />
                </Box>
              )}
            </Center>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Tabs.Content>
  );
}

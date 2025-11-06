'use client';
import {
  Box,
  Center,
  Flex,
  Heading,
  Link,
  Menu,
  Portal,
  SimpleGrid,
  Spacer,
  Table,
  Text,
} from '@chakra-ui/react';
import {
  fetchMatchProgressive,
  ProgressiveMatch,
  skillRank,
  skillRankCombined,
} from '@gravllift/halo-helpers';
import { MatchSkill } from 'halo-infinite-api';
import { ExternalLink } from 'lucide-react';
import { DateTime, Duration } from 'luxon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Unsubscribable } from 'rxjs';
import {
  abortSignalAny,
  ResolvablePromise,
} from '../../../../libs/utilities/src';
import { aggregatePlayersStats } from '../../lib/stats/aggregate-team-player-stats';
import { getObjectivePoints } from '../../lib/stats/objective-points';
import { playerStatsCategory } from '../columns/base-columns';
import GameVariantCategoryDisplay from '../game-variant-category-display/game-variant-category-display';
import { useLeaderboard } from '../leaderboard-provider/leaderboard-context';
import { Loading } from '../loading';
import { useNavigationController } from '../navigation-context';
import RoleGraph from '../role-graph';
import { Tooltip } from '../ui/tooltip';
import { VerticalCenter } from '../vertical-center';
import FFARoleChart from './ffa-role-chart';
import { NavigationButtons } from './navigation-buttons';
import PlayerCategoryTable from './player-category-table';
import Score from './score';
import SkillRankingsTable from './skill-rankings-table';
import { useTeamPresets } from './team-presets';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';

export interface MatchProps {
  matchId: string;
  filters: string | undefined;
}

export default function Match({ matchId, filters }: MatchProps) {
  const leaderboard = useLeaderboard();
  const haloCaches = useHaloCaches();
  const [match, setMatch] = useState<ProgressiveMatch>();
  const { signal: navigationSignal } = useNavigationController();
  useEffect(() => {
    const abortController = new AbortController();
    const combinedSignal = abortSignalAny([
      abortController.signal,
      navigationSignal,
    ]);
    let matchSubscription: Unsubscribable | undefined = undefined;

    haloCaches.matchStatsCache
      .get(matchId, combinedSignal)
      .then((result) => {
        if (combinedSignal.aborted) return;

        setMatch(result);
        document.title = `${
          'PublicName' in result.MatchInfo.UgcGameVariant
            ? result.MatchInfo.UgcGameVariant.PublicName
            : GameVariantCategoryDisplay({
                gameVariantCategory: result.MatchInfo.GameVariantCategory,
              })
        }${
          'PublicName' in result.MatchInfo.MapVariant
            ? ` on ${result.MatchInfo.MapVariant.PublicName}`
            : ''
        } | Halo Query`;

        matchSubscription = fetchMatchProgressive(result, {
          signal: combinedSignal,
          leaderboard,
          haloCaches,
          loadUserData: true,
        }).subscribe({ next: setMatch, error: console.error });
      })
      .catch((error) => {
        // Handle promise rejection to prevent unhandled errors
        if (error.name !== 'AbortError') {
          console.error('Error fetching match:', error);
        }
      });
    return () => {
      abortController.abort();
      matchSubscription?.unsubscribe();
    };
  }, [matchId, leaderboard]);

  const { focusPlayer, setFocusPlayer } = useFocusPlayer();
  const focusPlayerPromise = useMemo(
    () => new ResolvablePromise<string | string[]>(),
    []
  );
  const matchFocusPlayer = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    if (
      focusPlayer &&
      typeof focusPlayer === 'string' &&
      match?.Players.some(
        (p) =>
          'gamertag' in p &&
          p.gamertag?.toLowerCase() === focusPlayer.toLowerCase()
      )
    ) {
      return focusPlayer;
    }

    if (match?.Players[0] && 'gamertag' in match.Players[0]) {
      return match.Players[0].gamertag;
    }
    return undefined;
  }, [match, focusPlayer]);
  useEffect(() => {
    if (matchFocusPlayer) {
      focusPlayerPromise.resolve(matchFocusPlayer);
    }
  }, [matchFocusPlayer, focusPlayerPromise]);
  useEffect(() => {
    if (!focusPlayer && match?.Players.length) {
      // If the current focus player is not in this match, clear it out.
      setFocusPlayer(null);
    }
  }, [focusPlayer, setFocusPlayer, match?.Players.length]);

  const csrExists = match?.Players.some(
    (p) => 'Skill' in p && p.Skill?.RankRecap.PreMatchCsr.Value
  );
  const tierCounterfactualsExist = match?.Players.some(
    (p) => 'Skill' in p && p.Skill?.Counterfactuals?.TierCounterfactuals.Bronze
  );

  const playersByTeam = match
    ? Array.from(match.Players.groupBy((p) => p.LastTeamId))
    : undefined;

  const teamPresets = useTeamPresets();
  const roundBased =
    match?.Teams.some(
      (t) => t.Stats.CoreStats.RoundsWon > 1 || t.Stats.CoreStats.RoundsLost > 1
    ) ?? false;

  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);

  return (
    <>
      <Flex justifyContent="center">
        <Box maxW="1000px" w="100%">
          <NavigationButtons
            focusPlayerPromise={focusPlayerPromise}
            matchId={matchId}
            filters={filters}
          />
          <Flex gap={2}>
            <Box flexGrow={1}>
              <Heading size="lg">
                {match ? (
                  'PublicName' in match.MatchInfo.UgcGameVariant ? (
                    match.MatchInfo.UgcGameVariant.PublicName
                  ) : (
                    <>
                      <GameVariantCategoryDisplay
                        gameVariantCategory={
                          match.MatchInfo.GameVariantCategory
                        }
                      />{' '}
                      {'PublicName' in match.MatchInfo.MapVariant
                        ? `on ${match.MatchInfo.MapVariant.PublicName}`
                        : ''}
                    </>
                  )
                ) : (
                  matchId
                )}
              </Heading>
              <Box flexGrow={1}>
                {match &&
                  DateTime.fromISO(match.MatchInfo.StartTime).toLocaleString(
                    DateTime.DATETIME_SHORT
                  )}
              </Box>
            </Box>
            <VerticalCenter>
              <Menu.Root>
                <Menu.Trigger as={Link} aria-label="External Links">
                  <Text hideBelow="sm">External Match Links</Text>
                  <ExternalLink />
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.Item asChild value="Halo Waypoint">
                        {matchFocusPlayer && (
                          <Link
                            target="_blank"
                            href={`https://www.halowaypoint.com/halo-infinite/players/${matchFocusPlayer}/matches/${matchId}`}
                          >
                            Halo Waypoint
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item asChild value="Halo Tracker">
                        <Link
                          target="_blank"
                          href={`https://halotracker.com/halo-infinite/match/${matchId}`}
                        >
                          Halo Tracker
                        </Link>
                      </Menu.Item>
                      <Menu.Item asChild value="Halo Data Hive">
                        {matchFocusPlayer && (
                          <Link
                            target="_blank"
                            href={`https://halodatahive.com/Infinite/Match/${matchId}?gamertag=${matchFocusPlayer}`}
                          >
                            Halo Data Hive
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item asChild value="Leaf App">
                        <Link
                          target="_blank"
                          href={`https://leafapp.co/game/${matchId}`}
                        >
                          Leaf App
                        </Link>
                      </Menu.Item>
                      <Menu.Item asChild value="Spartan Record">
                        {matchFocusPlayer && (
                          <Link
                            target="_blank"
                            href={`https://spartanrecord.com/match/${matchId}/${matchFocusPlayer}`}
                          >
                            Spartan Record
                          </Link>
                        )}
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            </VerticalCenter>
          </Flex>
          {match && (
            <>
              {'Files' in match.MatchInfo.MapVariant ? (
                <Center mb={2}>
                  <Box
                    display="flex"
                    width={'100%'}
                    height={200}
                    bgImage={`url(${
                      match.MatchInfo.MapVariant.Files.Prefix +
                      match.MatchInfo.MapVariant.Files.FileRelativePaths.find(
                        (f) => f.startsWith('images/hero')
                      )
                    })`}
                    bgRepeat={'no-repeat'}
                    bgPos={'center center'}
                    flexDirection={'column'}
                  >
                    <Flex justifyContent="center" height="36px">
                      <VerticalCenter backgroundColor="gray.500" px={2}>
                        <Heading size="md">
                          {Duration.fromISO(
                            match.MatchInfo.PlayableDuration
                          ).toFormat('m:ss')}
                        </Heading>
                      </VerticalCenter>
                    </Flex>
                    <Spacer h="5px" />
                    <Flex flexGrow={1} justifyContent="center">
                      <Score
                        match={match}
                        teamPresets={teamPresets}
                        roundBased={roundBased}
                      />
                    </Flex>
                    <Box height="36px" />
                  </Box>
                </Center>
              ) : null}
              <Box mb={2}>
                <Center>
                  {match.MatchInfo.TeamsEnabled ? (
                    <SimpleGrid minChildWidth={{ md: '400px' }} width="100%">
                      {match.Teams.filter((t) =>
                        match.Players.some((p) => p.LastTeamId === t.TeamId)
                      ).map((t) => {
                        const teamPlayers = match.Players.filter(
                          (p) => p.LastTeamId === t.TeamId
                        );
                        // Halo's total summation seems to be broken, use our own
                        const teamTotals = {
                          kills: teamPlayers?.sum(
                            (p) =>
                              p.PlayerTeamStats.find(
                                (s) => s.TeamId === t.TeamId
                              )?.Stats.CoreStats.Kills ?? 0
                          ),
                          assists: teamPlayers?.sum(
                            (p) =>
                              p.PlayerTeamStats.find(
                                (s) => s.TeamId === t.TeamId
                              )?.Stats.CoreStats.Assists ?? 0
                          ),
                          damage: teamPlayers?.sum(
                            (p) =>
                              p.PlayerTeamStats.find(
                                (s) => s.TeamId === t.TeamId
                              )?.Stats.CoreStats.DamageDealt ?? 0
                          ),
                          objective: getObjectivePoints(
                            match.MatchInfo.GameVariantCategory,
                            aggregatePlayersStats(teamPlayers ?? [], t.TeamId)
                          ),
                        };
                        return (
                          <Box key={t.TeamId}>
                            <RoleGraph
                              height={400}
                              stats={
                                teamPlayers
                                  ?.map((p) => {
                                    const playerTeamStat =
                                      p.PlayerTeamStats.find(
                                        (t2) => t2.TeamId === t.TeamId
                                      );
                                    if (!playerTeamStat) {
                                      throw new Error(
                                        `Team stat not found for player ${p.PlayerId}`
                                      );
                                    }

                                    const objectivePoints = getObjectivePoints(
                                      match.MatchInfo.GameVariantCategory,
                                      playerTeamStat.Stats
                                    );
                                    return {
                                      gamertag:
                                        ('gamertag' in p && p.gamertag) ||
                                        p.PlayerId ||
                                        '???',
                                      kills: !teamTotals.kills
                                        ? 0
                                        : playerTeamStat.Stats.CoreStats.Kills /
                                          teamTotals.kills,
                                      assists: !teamTotals.assists
                                        ? 0
                                        : playerTeamStat.Stats.CoreStats
                                            .Assists / teamTotals.assists,
                                      damage: !teamTotals.damage
                                        ? 0
                                        : playerTeamStat.Stats.CoreStats
                                            .DamageDealt / teamTotals.damage,
                                      objective:
                                        objectivePoints != null &&
                                        teamTotals.objective != null
                                          ? teamTotals.objective === 0
                                            ? 0
                                            : objectivePoints /
                                              teamTotals.objective
                                          : undefined,
                                    };
                                  })
                                  .sortBy((p) => p.gamertag) ?? []
                              }
                            />
                          </Box>
                        );
                      })}
                    </SimpleGrid>
                  ) : (
                    <FFARoleChart match={match} />
                  )}
                </Center>
              </Box>
            </>
          )}
        </Box>
      </Flex>
      {match ? (
        <>
          {match.Players.some((p) => 'Skill' in p && p.Skill) ? (
            <>
              <Center>
                <Box width="100%">
                  <Heading size="md">
                    {match.MatchInfo.TeamsEnabled ? 'Team' : 'Player'} Skills
                  </Heading>
                </Box>
              </Center>
              <Box overflowX={'auto'} mb={2}>
                <Table.Root variant={'line'} showColumnBorder size="sm">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>
                        {match.MatchInfo.TeamsEnabled ? 'Team' : 'Player'}
                      </Table.ColumnHeader>
                      {csrExists ? (
                        <Table.ColumnHeader textAlign="end">
                          <Tooltip content="Competitive Skill Ranking">
                            <Text>CSR</Text>
                          </Tooltip>
                        </Table.ColumnHeader>
                      ) : null}
                      <Table.ColumnHeader textAlign="end">
                        <Tooltip content="Matchmaking Ranking">
                          <Text>MMR</Text>
                        </Tooltip>
                      </Table.ColumnHeader>
                      {tierCounterfactualsExist ? (
                        <>
                          <Table.ColumnHeader textAlign="end">
                            <Tooltip content="Expected Skill Ranking">
                              <Text>ESR</Text>
                            </Tooltip>
                          </Table.ColumnHeader>
                          <Table.ColumnHeader textAlign="end">
                            <Tooltip content="Performance Skill Ranking - Kills">
                              <Text>PSR-K</Text>
                            </Tooltip>
                          </Table.ColumnHeader>
                          <Table.ColumnHeader textAlign="end">
                            <Tooltip content="Performance Skill Ranking - Deaths">
                              <Text>PSR-D</Text>
                            </Tooltip>
                          </Table.ColumnHeader>
                        </>
                      ) : null}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body color="gray.300">
                    {Array.from(match.Players.groupBy((p) => p.LastTeamId))
                      .sortBy(
                        ([teamId]) =>
                          match.Teams.find((t) => t.TeamId === teamId)?.Rank ??
                          Number.MAX_SAFE_INTEGER
                      )
                      .map(([teamId, players]) => {
                        const sortedTeamPlayers = players.sortByDesc(
                          (p) =>
                            ('Skill' in p &&
                              (skillRank(p.Skill, 'Kills', 'Count') ??
                                (p.Skill &&
                                  'Kills' in p.Skill.StatPerformances &&
                                  p.Skill.StatPerformances.Kills.Count))) ||
                            0
                        );
                        const teamPlayersWithPreCsr = sortedTeamPlayers.filter(
                          (p) =>
                            'Skill' in p &&
                            p.Skill &&
                            !isNaN(p.Skill.RankRecap.PreMatchCsr.Value) &&
                            p.Skill.RankRecap.PreMatchCsr.Value > -1
                        );
                        let teamMmr: number | 'Infinity' | undefined =
                          undefined;
                        for (const p of players) {
                          if (
                            'Skill' in p &&
                            (typeof p.Skill?.TeamMmr === 'number' ||
                              p.Skill?.TeamMmr === 'Infinity')
                          ) {
                            teamMmr = p.Skill.TeamMmr;
                            break;
                          }
                        }
                        return (
                          <Table.Row
                            key={teamId}
                            backgroundColor={
                              match.MatchInfo.TeamsEnabled
                                ? teamPresets[teamId]?.color
                                : undefined
                            }
                          >
                            <Table.Cell>
                              {(players.length === 1 &&
                                'gamertag' in players[0] &&
                                players[0].gamertag) ||
                                teamPresets[teamId].name}
                            </Table.Cell>
                            {csrExists ? (
                              <Table.Cell textAlign="end">
                                {teamPlayersWithPreCsr.length > 0
                                  ? teamPlayersWithPreCsr
                                      .map(
                                        (p) =>
                                          'Skill' in p &&
                                          p.Skill?.RankRecap.PreMatchCsr.Value
                                      )
                                      .average()
                                      .toFixed(2)
                                  : 'Unrated'}
                              </Table.Cell>
                            ) : null}
                            <Table.Cell textAlign="end">
                              {typeof teamMmr === 'number'
                                ? teamMmr?.toFixed(2)
                                : teamMmr ||
                                  players.find(
                                    (
                                      p
                                    ): p is typeof p & { Skill?: MatchSkill } =>
                                      'Skill' in p
                                  )?.Skill?.TeamMmr}
                            </Table.Cell>
                            {tierCounterfactualsExist ? (
                              <>
                                <Table.Cell textAlign="end">
                                  {sortedTeamPlayers
                                    .map(
                                      (p) =>
                                        'Skill' in p &&
                                        skillRankCombined(p.Skill, 'Expected')
                                    )
                                    .average()
                                    .toFixed(2)}
                                </Table.Cell>
                                <Table.Cell textAlign="end">
                                  {sortedTeamPlayers
                                    .map(
                                      (p) =>
                                        'Skill' in p &&
                                        skillRank(p.Skill, 'Kills', 'Count')
                                    )
                                    .average()
                                    .toFixed(2)}
                                </Table.Cell>
                                <Table.Cell textAlign="end">
                                  {sortedTeamPlayers
                                    .map(
                                      (p) =>
                                        'Skill' in p &&
                                        skillRank(p.Skill, 'Deaths', 'Count')
                                    )
                                    .average()
                                    .toFixed(2)}
                                </Table.Cell>
                              </>
                            ) : null}
                          </Table.Row>
                        );
                      })}
                  </Table.Body>
                </Table.Root>
              </Box>
            </>
          ) : null}
          <Box mb={2}>
            <Heading size="md">Carnage Stats</Heading>
            <PlayerCategoryTable
              match={match}
              category={playerStatsCategory}
              playersByTeam={playersByTeam}
              teamPresets={teamPresets}
            />
          </Box>
          {match.Players[0] &&
          'Skill' in match.Players[0] &&
          match.Players[0].Skill ? (
            <SkillRankingsTable match={match} playersByTeam={playersByTeam} />
          ) : null}
        </>
      ) : (
        <Loading centerProps={{ height: '200px' }} />
      )}
    </>
  );
}

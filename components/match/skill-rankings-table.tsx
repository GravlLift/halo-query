'use client';
import {
  Box,
  Flex,
  Heading,
  HoverCard,
  Icon,
  Portal,
  Table,
  Text,
} from '@chakra-ui/react';
import {
  isValidCounterfactual,
  isValidStatPerformance,
  MatchPlayers,
  PlayerMatchHistoryStatsSkill,
  ProgressiveMatch,
  skillRank,
  skillRankCombined,
} from '@gravllift/halo-helpers';
import { MatchSkill } from 'halo-infinite-api';
import { ChevronDown, ChevronUp, CircleHelp } from 'lucide-react';
import { JSX, RefObject } from 'react';
import { toFixed343 } from '../../lib/render-helpers';
import CsrDeltaDisplay from '../csr-delta-display/csr-delta-display';
import { Tooltip } from '../ui/tooltip';
import GamertagDisplay from './gamertag-display';
import { useTeamPresets } from './team-presets';

export default function SkillRankingsTable({
  playersByTeam,
  match,
}: {
  playersByTeam: Array<[number, MatchPlayers]> | undefined;
  match: PlayerMatchHistoryStatsSkill | ProgressiveMatch;
}) {
  const csrExists = match?.Players.some(
    (p) => 'Skill' in p && p.Skill?.RankRecap.PreMatchCsr.Value
  );
  const tierCounterfactualsExist = match?.Players.some(
    (p) => 'Skill' in p && p.Skill?.Counterfactuals?.TierCounterfactuals.Bronze
  );

  const teamPresets = useTeamPresets();

  const matchStats = 'MatchStats' in match ? match.MatchStats : match;
  return (
    <Box>
      <Heading size="md">Skill Rankings</Heading>
      <Table.ScrollArea>
        <Table.Root variant={'line'} showColumnBorder size={'sm'}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader></Table.ColumnHeader>
              {csrExists ? (
                <Table.ColumnHeader colSpan={2}>
                  <Tooltip content="Competitive Skill Ranking">CSR</Tooltip>
                </Table.ColumnHeader>
              ) : null}
              {tierCounterfactualsExist ? (
                <Table.ColumnHeader rowSpan={2}>
                  <Tooltip content="Average of ESR-K and ESR-D">ESR</Tooltip>
                </Table.ColumnHeader>
              ) : null}
              <Table.ColumnHeader colSpan={tierCounterfactualsExist ? 4 : 2}>
                Kills
              </Table.ColumnHeader>
              <Table.ColumnHeader colSpan={tierCounterfactualsExist ? 4 : 2}>
                Deaths
              </Table.ColumnHeader>
            </Table.Row>
            <Table.Row>
              <Table.ColumnHeader>GamerTag</Table.ColumnHeader>
              {csrExists ? (
                <>
                  <Table.ColumnHeader>
                    <Tooltip content="CSR at Match Start">Pre</Tooltip>
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    <Tooltip content="CSR change">Delta</Tooltip>
                  </Table.ColumnHeader>
                </>
              ) : null}
              <Table.ColumnHeader>
                <Tooltip content="Expected Kills">Expected</Tooltip>
              </Table.ColumnHeader>
              {tierCounterfactualsExist ? (
                <Table.ColumnHeader>
                  <Tooltip content="Expected Skill Rank - Kills">ESR-K</Tooltip>
                </Table.ColumnHeader>
              ) : null}
              <Table.ColumnHeader>
                <Tooltip content="Actual Kills">Actual</Tooltip>
              </Table.ColumnHeader>
              {tierCounterfactualsExist ? (
                <Table.ColumnHeader>
                  <Tooltip content="Performance Skill Rank - Kills">
                    PSR-K
                  </Tooltip>
                </Table.ColumnHeader>
              ) : null}
              <Table.ColumnHeader>
                <Tooltip content="Expected Deaths">Expected</Tooltip>
              </Table.ColumnHeader>
              {tierCounterfactualsExist ? (
                <Table.ColumnHeader>
                  <Tooltip content="Expected Skill Rank - Deaths">
                    ESR-D
                  </Tooltip>
                </Table.ColumnHeader>
              ) : null}
              <Table.ColumnHeader>
                <Tooltip content="Actual Deaths">Actual</Tooltip>
              </Table.ColumnHeader>
              {tierCounterfactualsExist ? (
                <Table.ColumnHeader>
                  <Tooltip content="Performance Skill Rank - Deaths">
                    PSR-D
                  </Tooltip>
                </Table.ColumnHeader>
              ) : null}
            </Table.Row>
          </Table.Header>
          <Table.Body color="gray.300">
            {playersByTeam
              ?.sortBy(
                ([teamId]) =>
                  matchStats?.Teams.find((t) => t.TeamId === teamId)?.Rank ??
                  Number.MAX_SAFE_INTEGER
              )
              .map(([teamId, players]) =>
                players
                  .sortByDesc(
                    (p) =>
                      skillRank(p.Skill, 'Kills', 'Count') ??
                      ((p.Skill &&
                        'Kills' in p.Skill.StatPerformances &&
                        p.Skill.StatPerformances.Kills.Count) ||
                        0)
                  )
                  .map((p) => {
                    const playerTeam = p.PlayerTeamStats.find(
                      (t) => t.TeamId === teamId
                    );
                    if (!playerTeam) {
                      throw new Error(
                        `Player team not found for player ${p.PlayerId}`
                      );
                    }

                    const teamPlayers = matchStats?.Players.filter(
                      (p2) => p2.LastTeamId === teamId
                    );
                    const enemyPlayers = matchStats?.Players.filter(
                      (p2) => p2.LastTeamId !== teamId
                    );

                    return (
                      <Table.Row
                        key={p.PlayerId}
                        backgroundColor={
                          match.MatchInfo.TeamsEnabled
                            ? teamPresets[teamId]?.color
                            : undefined
                        }
                      >
                        <Table.Cell>
                          <GamertagDisplay player={p} />
                        </Table.Cell>
                        {csrExists ? (
                          p.Skill?.RankRecap.PreMatchCsr.Value === -1 ? (
                            <Table.Cell colSpan={2} textAlign={'center'}>
                              Unrated
                            </Table.Cell>
                          ) : (
                            <>
                              <Table.Cell textAlign="end">
                                {p.Skill?.RankRecap.PreMatchCsr.Value}
                              </Table.Cell>
                              <Table.Cell textAlign="end">
                                <CsrDeltaDisplay
                                  skill={p.Skill}
                                  outcome={p.Outcome}
                                  allEnemiesFinished={
                                    enemyPlayers?.every(
                                      (p) =>
                                        p.ParticipationInfo.PresentAtCompletion
                                    ) ?? true
                                  }
                                  allTeammatesFinished={
                                    teamPlayers?.every(
                                      (p) =>
                                        p.ParticipationInfo.PresentAtCompletion
                                    ) ?? true
                                  }
                                  teamSkills={
                                    teamPlayers
                                      ?.filter(
                                        (
                                          p
                                        ): p is typeof p & {
                                          Skill?: MatchSkill;
                                        } => 'Skill' in p
                                      )
                                      .map((p) => p.Skill) ?? []
                                  }
                                />
                              </Table.Cell>
                            </>
                          )
                        ) : null}
                        {tierCounterfactualsExist ? (
                          <>
                            <Table.Cell textAlign="end">
                              {skillRankCombined(p.Skill, 'Expected')?.toFixed(
                                2
                              )}
                            </Table.Cell>
                          </>
                        ) : null}
                        <Table.Cell textAlign="end">
                          {toFixed343(
                            p.Skill?.Counterfactuals?.SelfCounterfactuals.Kills
                          )}
                        </Table.Cell>
                        {tierCounterfactualsExist ? (
                          <Table.Cell textAlign="end">
                            {skillRank(p.Skill, 'Kills', 'Expected')?.toFixed(
                              2
                            ) ?? (
                              <ExplainMissingSkill
                                skill={p.Skill}
                                stat="Kills"
                              />
                            )}
                          </Table.Cell>
                        ) : null}
                        <Table.Cell textAlign="end">
                          <ActualVsExpectedDisplay player={p} stat="Kills" />
                        </Table.Cell>
                        {tierCounterfactualsExist ? (
                          <Table.Cell textAlign="end">
                            {skillRank(p.Skill, 'Kills', 'Count')?.toFixed(
                              2
                            ) ?? (
                              <ExplainMissingSkill
                                skill={p.Skill}
                                stat="Kills"
                              />
                            )}
                          </Table.Cell>
                        ) : null}
                        <Table.Cell textAlign="end">
                          {toFixed343(
                            p.Skill?.Counterfactuals?.SelfCounterfactuals.Deaths
                          )}
                        </Table.Cell>
                        {tierCounterfactualsExist ? (
                          <Table.Cell textAlign="end">
                            {skillRank(p.Skill, 'Deaths', 'Expected')?.toFixed(
                              2
                            ) ?? (
                              <ExplainMissingSkill
                                skill={p.Skill}
                                stat="Deaths"
                              />
                            )}
                          </Table.Cell>
                        ) : null}
                        <Table.Cell textAlign="end">
                          <ActualVsExpectedDisplay player={p} stat="Deaths" />
                        </Table.Cell>
                        {tierCounterfactualsExist ? (
                          <Table.Cell textAlign="end">
                            {skillRank(p.Skill, 'Deaths', 'Count')?.toFixed(
                              2
                            ) ?? (
                              <ExplainMissingSkill
                                skill={p.Skill}
                                stat="Deaths"
                              />
                            )}
                          </Table.Cell>
                        ) : null}
                      </Table.Row>
                    );
                  })
              )}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Box>
  );
}

function ExplainMissingSkill({
  skill,
  stat,
}: {
  skill: MatchSkill<1 | 0> | undefined;
  stat: 'Kills' | 'Deaths';
}) {
  let explanation: string;
  if (skill == null) {
    explanation = 'No skill information was returned for this player.';
  } else if (
    'Kills' in skill.StatPerformances &&
    skill.StatPerformances[stat]['Count'] === 0
  ) {
    explanation = `This player did not record any ${stat.toLowerCase()} in this match. For whatever reason, this breaks Halo's counterfactual code. Possibly they're dividing by 0 somewhere in there?`;
  } else if (!isValidCounterfactual(skill.Counterfactuals, stat)) {
    explanation = `For some reason, this performance broke Halo's counterfactual code. Only the developers there know...`;
  } else {
    explanation = `I actually don't know what happened here. If you see this message, send me the link to the match in the Discord.`;
  }
  return (
    <HoverCard.Root>
      <HoverCard.Trigger>
        <CircleHelp />
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content>
            <HoverCard.Arrow />
            <Text as="b">Why&apos;s this blank?</Text>
            <Box>{explanation}</Box>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  );
}

function ActualVsExpectedDisplay({
  player,
  stat,
}: {
  player: PlayerMatchHistoryStatsSkill['MatchStats']['Players'][number];
  stat: 'Kills' | 'Deaths';
}) {
  let counterfactualStat =
    player.Skill?.Counterfactuals?.SelfCounterfactuals[stat];

  if (typeof counterfactualStat !== 'number') {
    counterfactualStat =
      player.Skill && isValidStatPerformance(player.Skill.StatPerformances)
        ? (player.Skill as MatchSkill<0>).StatPerformances[stat].Count
        : undefined;
  }

  if (typeof counterfactualStat !== 'number') {
    return player.PlayerTeamStats[0].Stats.CoreStats[stat];
  }
  const diff =
    player.PlayerTeamStats[0].Stats.CoreStats[stat] - counterfactualStat;

  let icon: JSX.Element | null;
  if (diff > 0) {
    icon = (
      <Icon color={stat === 'Kills' ? 'green.300' : 'red.300'} asChild>
        <ChevronUp />
      </Icon>
    );
  } else if (diff < 0) {
    icon = (
      <Icon color={stat === 'Deaths' ? 'green.300' : 'red.300'}>
        <ChevronDown />
      </Icon>
    );
  } else {
    icon = null;
  }

  return (
    <Flex justifyContent="space-between">
      <Box textAlign={'left'}>{icon}</Box>
      <Box textAlign={'right'}>
        {player.PlayerTeamStats[0].Stats.CoreStats[stat]}
      </Box>
    </Flex>
  );
}

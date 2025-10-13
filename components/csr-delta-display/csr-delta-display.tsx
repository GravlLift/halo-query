import {
  Box,
  Flex,
  HoverCard,
  Icon,
  Link,
  List,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { skillRank, skillRankCombined } from '@gravllift/halo-helpers';
import { MatchOutcome, MatchSkill, PlaylistCsr } from 'halo-infinite-api';
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  CircleHelp,
  Minus,
} from 'lucide-react';
import NextLink from 'next/link';
import type { JSX } from 'react';

enum Too {
  High,
  Low,
  JustRight,
}

function CsrEsrExplanation({
  esr,
  csr,
}: {
  esr: number | undefined;
  csr: number;
}) {
  const playerCsr = esr
    ? csr < esr - 50
      ? Too.Low
      : csr > esr + 50
      ? Too.High
      : Too.JustRight
    : undefined;

  let str = `Their pre-game CSR of ${csr} was `;
  let listIcon: JSX.Element;

  if (playerCsr === Too.Low) {
    listIcon = (
      <List.Indicator asChild>
        <Icon color="green.500" asChild>
          <ChevronsUp />
        </Icon>
      </List.Indicator>
    );
    str += `significantly lower than`;
  } else if (playerCsr === Too.High) {
    listIcon = (
      <List.Indicator asChild>
        <Icon color="red.500" asChild>
          <ChevronsDown />
        </Icon>
      </List.Indicator>
    );
    str += `significantly higher than`;
  } else {
    listIcon = (
      <List.Indicator asChild>
        <Icon asChild>
          <Minus />
        </Icon>
      </List.Indicator>
    );
    str += `reasonably close to`;
  }

  str += ` their game calculated expected skill rank of ${esr?.toFixed(0)}.`;
  return (
    <List.Item>
      {listIcon}
      {str}
    </List.Item>
  );
}

function PlayerPerformanceExplanation({
  esr,
  psr,
}: {
  esr: number | undefined;
  psr: number | undefined;
}) {
  let str = `This player had a personal performance `;

  const playerPerformance =
    psr && esr
      ? psr < esr - 100
        ? Too.Low
        : psr > esr + 100
        ? Too.High
        : Too.JustRight
      : undefined;
  let listIcon: JSX.Element;

  if (playerPerformance === Too.Low) {
    listIcon = (
      <List.Indicator asChild>
        <Icon color="red.500" asChild>
          <ChevronDown />
        </Icon>
      </List.Indicator>
    );
    str += `that fell short of`;
  } else if (playerPerformance === Too.High) {
    listIcon = (
      <List.Indicator asChild>
        <Icon color="green.500" asChild>
          <ChevronUp />
        </Icon>
      </List.Indicator>
    );
    str += `that exceeded`;
  } else {
    listIcon = (
      <List.Indicator asChild>
        <Minus />
      </List.Indicator>
    );
    str += `that fit`;
  }

  str += ` the game's expectations.`;
  return (
    <List.Item>
      {listIcon}
      {str}
    </List.Item>
  );
}

const AwardExplanation = ({
  playerOutcome: outcome,
  delta,
  esr,
  psr,
  rankRecap,
  allTeammatesFinished,
  allEnemiesFinished,
}: {
  playerOutcome: MatchOutcome;
  delta: number;
  esr: number | undefined;
  psr: number | undefined;
  rankRecap: {
    PreMatchCsr: PlaylistCsr;
    PostMatchCsr: PlaylistCsr;
  };
  allTeammatesFinished: boolean;
  allEnemiesFinished: boolean;
}): JSX.Element[] | undefined => {
  switch (outcome) {
    case MatchOutcome.Tie: {
      if (delta === 0) {
        return [
          <Text key="tie-0">
            The match was a tie, so no CSR adjustments were made to anyone.
          </Text>,
        ];
      }
      break;
    }
    case MatchOutcome.DidNotFinish: {
      if (delta === -15) {
        return [
          <Text key="did-not-finish-0">
            This player was the first player to leave the match, so this player
            received the maximum CSR penalty.
          </Text>,
          <Text key="did-not-finish-1">
            We all get disconnected from the match sometimes. It happens.
            Hopefully this was one of those times for this player, and they
            didn&apos;t simply deliberately choose to make the experience of 7
            other people worse because they just don&apos;t like to play
            Extraction or something.
          </Text>,
        ];
      } else if (delta === 0) {
        return [
          <Text key="did-not-finish-2">
            This player left the match, but weren&apos;t the first player on
            their team to do so. They received no penalty for leaving an
            unbalanced match.
          </Text>,
        ];
      }
      if (delta === -5) {
        return [
          <Text key="did-not-finish-3">
            This player left the match, but weren&apos;t the first player on
            their team to do so. They received a mild CSR penalty, which is
            kinda BS.
          </Text>,
        ];
      } else {
        return [
          <Text>
            This player left the match, but weren&apos;t the first player on
            their team to do so. Unfortunately, this player still received a CSR
            penalty for their loss. Which sucks.
          </Text>,
        ];
      }
    }
    default: {
      if ((delta === -5 || delta === 0) && !allTeammatesFinished) {
        return [
          <Text key="delta-5">
            This player lost the match after one or more of their teammates
            quit. Hopefully they didn&apos;t drag out a 4v1 for too long...
          </Text>,
        ];
      } else if (delta === 5 && !allEnemiesFinished) {
        return [
          <Text key="delta-6">
            This player won the match, but one or more of their opponents quit
            early on. They received a mild CSR reward for doing basically
            nothing.
          </Text>,
        ];
      } else if (
        rankRecap.PostMatchCsr.Value % 300 === 0 &&
        outcome === MatchOutcome.Loss &&
        rankRecap.PreMatchCsr.DemotionProtectionMatchesRemaining > 0
      ) {
        return [
          <Text key="delta-7">
            This player lost the match, but their CSR was protected by{' '}
            <Link asChild>
              <NextLink href="https://www.halowaypoint.com/news/december-ranked-updates">
                Ranked Demotion Protection
              </NextLink>
            </Link>
            .
          </Text>,
        ];
      }

      return [
        <List.Root textAlign={'left'} gap={2} variant={'plain'} key="delta-8">
          <CsrEsrExplanation esr={esr} csr={rankRecap.PreMatchCsr.Value} />
          <PlayerPerformanceExplanation esr={esr} psr={psr} />
        </List.Root>,
      ];
    }
  }
};

export default function CsrDeltaDisplay(props: {
  outcome: MatchOutcome;
  skill: MatchSkill | undefined;
  allTeammatesFinished: boolean;
  allEnemiesFinished: boolean;
  teamSkills: (MatchSkill | undefined)[];
}) {
  if (
    props.skill?.RankRecap == null ||
    props.skill.RankRecap.PreMatchCsr.Value < 0 ||
    props.skill.RankRecap.PostMatchCsr.Value < 0
  ) {
    return null;
  }

  const delta =
    props.skill.RankRecap.PostMatchCsr.Value -
    props.skill.RankRecap.PreMatchCsr.Value;

  const deltaText = delta > 0 ? `+${delta}` : delta;

  return (
    <Flex justifyContent="flex-end">
      <Box>{deltaText}</Box>
      <Box ml={1} lineHeight="12px">
        <HoverCard.Root>
          <HoverCard.Trigger>
            <CircleHelp />
          </HoverCard.Trigger>
          <Portal>
            <HoverCard.Positioner>
              <HoverCard.Content>
                <HoverCard.Arrow />
                <Stack gap="1">
                  <Text as="b">Player CSR was adjusted by {deltaText}</Text>
                  <AwardExplanation
                    playerOutcome={props.outcome}
                    delta={delta}
                    rankRecap={props.skill.RankRecap}
                    esr={skillRankCombined(props.skill, 'Expected')}
                    psr={skillRank(props.skill, 'Kills', 'Count')}
                    allTeammatesFinished={props.allTeammatesFinished}
                    allEnemiesFinished={props.allEnemiesFinished}
                  />
                </Stack>
              </HoverCard.Content>
            </HoverCard.Positioner>
          </Portal>
        </HoverCard.Root>
      </Box>
    </Flex>
  );
}

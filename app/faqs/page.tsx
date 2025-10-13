import {
  Box,
  Card,
  Center,
  Code,
  Flex,
  Heading,
  Image,
  Link,
  Text,
  List,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { ExternalLink } from 'lucide-react';
import styles from './page.module.css';
import { objectivePointsFormulas } from '../../lib/stats/objective-points';
import GameVariantCategoryDisplay from '../../components/game-variant-category-display/game-variant-category-display';
import { statsColumns } from '../../components/columns/stats-columns';
import { GameVariantCategory } from 'halo-infinite-api';
import { Fragment } from 'react';
import { percentFormatter } from '../../lib/formatters';
import FragmentLinkTarget from '../../components/fragment-link';

const CardHeaderLink = ({ text, id }: { text: string; id: string }) => (
  <Card.Header>
    <FragmentLinkTarget id={id} />
    <Link asChild>
      <NextLink href={'#' + id}>
        <Heading>{text}</Heading>
      </NextLink>
    </Link>
  </Card.Header>
);

const { columns } = statsColumns('Player');
type ColumnNames = keyof typeof columns;
const faqs = [
  {
    id: 'csr-mmr-esr-psr',
    question: 'What is CSR/MMR/ESR/PSR?',
    content: (
      <>
        <Text>
          In order, Competitive Skill Rank, MatchMaking Rank, Expected Skill
          Rank, and Performance Skill Rank. The first two are terms created by
          the developers of Halo, and there is{' '}
          <Link asChild>
            <NextLink
              target="_blank"
              href="https://www.halowaypoint.com/news/closer-look-halo-infinites-ranked-experience"
            >
              a lot of official developer literature on what they are and how
              they work
              <ExternalLink />
            </NextLink>
          </Link>
          . The latter are partly creations of my own.
        </Text>
        <Text>
          <Text as="b">TL;DR Version:</Text> CSR is what you see in game, MMR is
          what the game uses to match you with other players and is invisible to
          us, ESR is a reasonable approximation of MMR, and PSR is for
          approximating how well you did in a single match.
        </Text>
        <Heading className={styles['subheading']}>
          Competitive Skill Rank (CSR)
        </Heading>
        <Text>
          CSR is the most visible of all of the statistics; it&apos;s the one
          you see in game. When you win, it goes up, when you lose it goes down.
          The formula for how much it moves for a given win/loss is not publicly
          available, but based on my observations, two things influence it: your
          in-game performance and the difference between your MMR and your CSR.
          While the first is pretty self-explanatory, the second is by far the
          most impactful and requires a basic understanding of...
        </Text>
        <Heading className={styles['subheading']}>
          MatchMaking Rank (MMR)
        </Heading>
        <Text>
          This is a statistic maintained by the game that is mostly invisible to
          us*. It represents how good the game thinks you are, and (at the time
          of my writing this), appears to be what Halo is using to ensure fair
          matches. Regardless of if you win or lose, your in game performance
          will be judged and factored into this metric. In what is most likely
          an effort to prevent gaming the system, Halo has declined to expose
          the exact nature of how MMR is calculated.
        </Text>
        <Text>
          However, there are some hints. On the official Halo Waypoint website,
          there is a graph featuring your expected kills and deaths for every
          match you play. If you outperform your expectations, your MMR appears
          to increase. Miss your expectations, and you can expect it to dip
          accordingly. It&apos;s likely that kills and deaths are not the only
          factors that influence your MMR, but they are the only ones that we
          can see.
        </Text>
        <Heading className={styles['subheading']}>
          Expected Skill Rank (ESR)
        </Heading>
        <Text>
          That expected kill/death graph on halowaypoint.com has a lot more data
          available to it than what they&apos;ve chosen to display. Here&apos;s
          a sample of the data from a single match of my own:
        </Text>
        <pre style={{ maxWidth: '1000px', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(
            {
              SelfCounterfactuals: {
                Kills: 13.02902159740169,
                Deaths: 11.779710508499637,
              },
              TierCounterfactuals: {
                Bronze: {
                  Kills: 0.7181542783576873,
                  Deaths: 17.6524283446301,
                },
                Silver: {
                  Kills: 2.220069373790745,
                  Deaths: 16.31645277818232,
                },
                Gold: {
                  Kills: 4.78171550865068,
                  Deaths: 14.99185741714148,
                },
                Platinum: {
                  Kills: 8.085594967544454,
                  Deaths: 13.64572850930582,
                },
                Diamond: {
                  Kills: 11.907774926653307,
                  Deaths: 12.19888568969912,
                },
                Onyx: {
                  Kills: 16.05313653186301,
                  Deaths: 10.65299514545297,
                },
              },
            },
            undefined,
            2
          )}
        </pre>
        <Text>
          As you can see, in this particular match, with these particular
          opponents/teammates, it was expecting me to put up about 13 kills and
          die 12 times. However, it also included a{' '}
          <Code>TierCounterfactuals</Code> property, containing expected values
          for other ranks. At the time of that match, I was ranked as a low
          Diamond player, and you can see that the game expects me to slightly
          beat the Diamond benchmark. It seems safe to conclude that those
          counterfactuals represent the average player at the base MMR for that
          division (Bronze starts at 0, Silver at 300, etc.).
        </Text>
        <Text>
          If we take these values and linearly interpolate them, we can create a
          graph of what a player at any given skill level would be expected to
          perform for kills and deaths in that match. In this example, the
          counterfactuals map like so:
        </Text>
        <Center maxWidth="100%">
          <Image src="/ESR_graph.png" alt="ESR Graph"></Image>
        </Center>
        <Text>
          If we find the <Code>SelfCounterfactuals</Code> values on this line,
          which purportedly represent the kills and deaths that the game expects
          us to achieve given our MMR and the MMRs of everyone else in the
          lobby, we can match the point on the line to a skill ranking.
        </Text>
        <Text>
          Each game variant has its own ESR rating (including one for 3 flag CTF
          and another for 5 flag CTF), and they can move independently of one
          another.
        </Text>
        <Heading className={styles['subheading']}>
          Performance Skill Rank (PSR)
        </Heading>
        <Text>
          Same thing as ESR, except we use the actual kills and deaths that you
          recorded in the match instead of the ones the game expected of you.
          This may be useful for determining how well you did in a single match,
          but it does result in some strange values (like negative skill) if you
          have a particularly good or bad game.
        </Text>
        <Heading className={styles['subheading']}>A few disclaimers...</Heading>
        <List.Root>
          <List.Item>
            MMR likely has more than just kills and deaths going into its
            computation, so ESR will always be merely a small window into that
            stat.
          </List.Item>
          <List.Item>
            Skill for kills and deaths can be different, even for the same
            player. ESR/PSR averages those two values together. For ESR,
            they&apos;re usually very close, but for PSR the <Code>-D</Code> and{' '}
            <Code>-K</Code> values can skew wildly.
          </List.Item>
          <List.Item>
            The counterfactuals stop at 1500 skill. Beyond that, I can only
            linearly extrapolate the Diamond/Onyx line. While this looks
            accurate-ish for pros I have checked, I have less confidence in
            those values.
          </List.Item>
        </List.Root>
        <Text as="cite">
          * MMR is not completely invisible to us. The halowaypoint.com API
          exposes the average MMR of a team to us for every match. We just
          don&apos;t know how individual team members&apos; MMRs compare to that
          average.
        </Text>
      </>
    ),
  },
  {
    id: 'csr-payouts',
    question:
      'I led my team in K/D, damage, accuracy, etc., but my teammates earned more CSR than me. Why?',
    content: (
      <>
        <Text>
          Your in-game performance has very little to do with the amount of CSR
          you are rewarded. In fact, before the match even starts, the game has
          a good general idea of what to award you if you win, and what to
          penalize you if you lose. That&apos;s because the primary factor in
          CSR rewards/penalities is the difference between your pre-match CSR
          and your pre-match MMR.
        </Text>
        <Text>
          If your CSR is much lower than your MMR, you will receive large
          rewards for wins and small penalties for losses, and vice versa. A CSR
          that&apos;s matching your MMR will generally result in
          rewards/penalities of +/-8 points.
        </Text>
        <Text>
          A really good or bad game performance can adjust this payout slightly,
          however it&apos;ll usually be by no more than a single point in either
          direction. A truly uncharacteristic performance is required to move
          the payout by even 2 CSR.
        </Text>
        <Text>
          For an official overview from Halo on how CSR rewards work, see{' '}
          <Link
            target="_blank"
            href="https://www.halowaypoint.com/news/closer-look-halo-infinites-ranked-experience"
          >
            this article
            <ExternalLink />
          </Link>
          .
        </Text>
      </>
    ),
  },
  {
    id: 'esr-payouts',
    question: 'How do I move my ESR?',
    content: (
      <Text>
        To put it simply, if you want to raise your ESR, kill more, die less,
        and win your matches. Those are the three metrics that are used to
        compute your skill ranking. Of the three, kills per minute seems to have
        more of an impact than the other two, though exactly how much likely
        varies from one game type to the next.
      </Text>
    ),
  },
  {
    id: 'objective-points',
    question: 'How are objective points calculated in the Roles graphs?',
    content: (
      <>
        <Text>
          Objective points in the role graphs are a weighted aggregation of
          various statistics that we feel accurately show that a player is
          &quot;playing the objective&quot;, rather than the traditional Slayer
          or Support roles. Usually the stats selected are those where excelling
          in the stat will actively hurt the amount of kills or assists a player
          will accumulate.
        </Text>
        <Text>These are the current statistics and their weights:</Text>
        {Object.entries(objectivePointsFormulas).map(
          ([gameVariant, cols]: [
            string,
            {
              [key in ColumnNames]?: number;
            }
          ]) => {
            const total = Object.values(cols).sum();
            return (
              <Fragment key={gameVariant}>
                <Heading className={styles['subheading']}>
                  <GameVariantCategoryDisplay
                    gameVariantCategory={+gameVariant as GameVariantCategory}
                  />
                </Heading>
                {Object.entries(cols).map(([k, weight]) => {
                  const relevantColumn = columns[k as keyof typeof columns];
                  return (
                    <Text key={k}>
                      {relevantColumn.text} -{' '}
                      {percentFormatter.format(weight / total)}
                    </Text>
                  );
                })}
              </Fragment>
            );
          }
        )}
      </>
    ),
  },
];

export default function FaqsPage() {
  return (
    <Flex justifyContent="center">
      <Box maxW="1000px">
        <Box py={2}>
          <Card.Root>
            <Card.Header>
              <Heading>Table of Contents</Heading>
            </Card.Header>
            <Card.Body>
              <List.Root paddingLeft="20px">
                {faqs.map(({ id, question }) => (
                  <List.Item key={id}>
                    <Link asChild>
                      <NextLink href={'#' + id}>{question}</NextLink>
                    </Link>
                  </List.Item>
                ))}
              </List.Root>
            </Card.Body>
          </Card.Root>
        </Box>
        {faqs.map(({ id, question, content }) => (
          <Box py={2} key={id}>
            <Card.Root>
              <CardHeaderLink text={question} id={id} />
              <Card.Body className={'paragraph'}>{content}</Card.Body>
            </Card.Root>
          </Box>
        ))}
      </Box>
    </Flex>
  );
}

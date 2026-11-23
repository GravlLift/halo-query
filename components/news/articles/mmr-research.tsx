import { Link, Text, Center, Image } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import NextLink from 'next/link';

export default function MmrResearch() {
  return (
    <>
      <Text>
        I&apos;ve always said that ESR is an approximation of MMR, and I think
        we have the opportunity to close the gap a little bit. Thanks to the
        recent creation of a tool by{' '}
        <Link href="https://www.reddit.com/r/CompetitiveHalo/comments/1xybxbt/i_think_i_figured_out_how_to_discover_your_hidden/">
          OpenSpartan <ExternalLink />
        </Link>
        , new data is now available to us, and based on my initial explorations,
        it looks like ESR may be systematically underestimating players in
        parties. I&apos;d like to further validate and refine these findings,
        but unfortunately, OpenSpartan&apos;s tool can only provide data when
        running on a player&apos;s PC while they are in a match. Since I can
        only collect data from my own matches, there&apos;s only so much I can
        learn.
      </Text>
      <Text>
        So I need your help. If you are on a PC and running the{' '}
        <Link href="https://github.com/OpenSpartan/mmr">
          OpenSpartan&apos;s mmr tool <ExternalLink />
        </Link>{' '}
        , you can help by donating your match data to my research. I&apos;ve
        created the{' '}
        <Link asChild>
          <NextLink href="/mmr-research">MMR Research page</NextLink>
        </Link>{' '}
        as a place for you to upload the data that program generates for you. In
        particular, Ranked match data is the most valuable for our research, as
        it can be directly compared to existing ESR data.
      </Text>
      <Text>
        I&apos;ve already put my preliminary findings to work on the match
        detail page in the Skill Table. You will notice two new columns there,
        "Party Size" (a nice side effect of this research) and "ESR (Party
        Adjusted)". For now, ESR values throughout the rest of the site still
        use the old metrics, but if these values hold up with the new data, we
        may consider updating ESR throughout the site to use the new metric.
      </Text>
      <Text>
        <Link asChild>
          <NextLink href="/mmr-research">
            Contribute your match data here!
          </NextLink>
        </Link>
      </Text>
      <Center maxWidth="100%">
        <Image src="/skill-rankings-table.png" alt="New Skill Table"></Image>
      </Center>
    </>
  );
}

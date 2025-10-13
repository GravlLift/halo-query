import { Link, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';

export default function GameVariantVsGameVariantCategories() {
  return (
    <>
      <Text>
        I&apos;ve been attempting to work out how ESR adjusts based on match
        performance, and one of things that kept bugging me was the seeming
        randomness of CTF ESR. A good performance would decrease it, and bad
        performances might increase it. Very confusing stuff.
      </Text>
      <Text>
        It finally dawned on me that CTF 3 Flag and CTF 5 Flag are being treated
        as two different ESR values. In hindsight, this should have been
        obvious, given that{' '}
        <Link
          target="_blank"
          href="https://www.reddit.com/r/CompetitiveHalo/comments/19f97ir/halo_query_a_new_stats_site_to_see_your_mmr/kjiwrd0/"
        >
          u/SecureStreet&apos;s original post on reddit
          <ExternalLink />
        </Link>{' '}
        from which the &quot;by game mode&quot; ESR graph is based had the two
        game types split. They appear to be highly correlated, so it was easier
        for the mistake to hide for this long.
      </Text>
      <Text>
        Anyway, the end result is that there&apos;s an extra category on the
        profile page. That&apos;s all for now!
      </Text>
    </>
  );
}

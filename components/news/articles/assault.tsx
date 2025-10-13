import { Link, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
export default function Assault() {
  return (
    <>
      <Text>
        A new update released for Halo Infinite today, and with it, we get a new
        (old) game mode:{' '}
        <Link href="https://www.halowaypoint.com/news/assault" target="_blank">
          Assault
          <ExternalLink />
        </Link>
        !
      </Text>
      <Text>
        While I&apos;m stoked that the game is continuing to get new content
        this far into its lifecycle, the game mode was unfortunately implemented
        using the &quot;Minigame&quot; game variant. As a result, there is only
        a single statistic that we can see related to objective points: Score.
        No arms, no disarms, no plants. Just score (which appears to go to the
        player who detonated the bomb).
      </Text>
      <Text>
        Since that&apos;s the case I&apos;ve gone ahead and added our lone
        statistic as the only input into the objective category on the roles
        graph for all Minigame game types. It is what it is.
      </Text>
      <Text>
        On a happier note, it&apos;s been{' '}
        <Link href="https://www.halowaypoint.com/news/go-live" target="_blank">
          a whole year since Halo Query went live
        </Link>
        ! Here&apos;s to another year of data crunching!
      </Text>
    </>
  );
}

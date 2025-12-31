import { Center, Text, Image, Link, Code } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
export default function Teammates() {
  return (
    <>
      <Text>
        Halo Query has always taken pride in showing you the statistics of your
        game that might be holding you back. But as we all know, the only real
        thing holding <b>you</b> back is your teammates. No doubt you&apos;d be
        putting Last Shot out of a job if only your matchmaking teammates could
        get their act together.
      </Text>
      <Text>
        Let&apos;s take a look at the newest tool you can use to avoid taking
        responsibility for your skills.
      </Text>
      <Center maxWidth="100%">
        <Image src="/teammates.png" alt="Teammates Table"></Image>
      </Center>
      <Text>
        This is Frosty's Teammates table, for example. The columns are fairly
        self explanatory, but the Performance Skill Ranking (PSR) ones have a
        slight nuance to them: These are Frosty's PSR values when playing with
        that teammate, and they are weighted averages based on match duration.
        This means that a 20 minute game will have more impact on the average
        than a 5 minute game. This should give you a good idea of how well
        you're playing with that teammate, regardless of sample size.
      </Text>
      <Text>
        You can find this table at the bottom of the player profiles. Shout out
        to{' '}
        <Link href="https://discord.gg/XuZsWZ2h5p" target="_blank">
          Halo Query Discord
          <ExternalLink />
        </Link>{' '}
        user radnade for the suggestion!
      </Text>
    </>
  );
}

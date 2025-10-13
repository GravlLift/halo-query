import { Center, Code, Image, Link, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
export default function QuerySavingSharing() {
  return (
    <>
      <Text>
        By popular demand (2 whole people!), I&apos;ve added the ability to save
        and share the queries you build on the &quot;Matches&quot; page. As you
        modify the filters, columns, or page size, you will notice that the URL
        of your browser will update. That URL will now contain all the data
        anyone would need to run the exact same query at a later date, so you
        can share it with your friends or bookmark it in your browser for later.
      </Text>
      <Text>
        Let&apos;s walk through a quick example. I use a specific gametype to do
        my warmups, and I like to be able to see my progress (or lack thereof)
        over time. I need a query that shows me all my games of that gametype,
        so I set up a filter for matches played with that Game Variant.
      </Text>
      <Center maxWidth="100%">
        <Image
          src="/bot-ffa-training-filter.png"
          alt="Bot FFA Training Filter"
        ></Image>
      </Center>
      <Text>
        The URL in my browser now contains a whole mess of characters that
        represent this particular filter. The relevant part will look something
        like:{' '}
        <Code wordBreak="break-all">
          &filters=%7B%22and%22%3A%5B%7B%22%3D%3D%22%3A%5B%7B%22var%22%3A%22Game+Variant%22%7D%2C%22Bot+FFA+Training%22%5D%7D%5D%7D
        </Code>
      </Text>
      <Text>
        Now I want to share a column layout. The &quot;Shyway&apos;s Bot
        Training&quot; preset (
        <Link
          href="https://www.youtube.com/watch?v=tiecHbFMeKE"
          target="_blank"
        >
          relevant Shyway video
          <ExternalLink />
        </Link>
        ) is a good start, but I&apos;d like to make a few tweaks to it. First I
        select the preset from the Column options to use it as a starting point.
      </Text>
      <Center maxWidth="100%">
        <Image
          src="/shyways-bot-training-preset.png"
          alt="Shyway's Bot Training Preset"
        ></Image>
      </Center>
      <Text>
        Then I flip the preset to &quot;Custom&quot;. This gives you all of the
        columns of whatever preset you were just on, but now you can modify them
        to suit your needs. Personal preference, there are a few columns in the
        preset that I don&apos;t care about, and I&apos;d like to add a few that
        are important to me. I&apos;m going to drop Deaths, Assists, and Damage
        Taken, swap Kills and Damage for their &apos;per minute&apos;
        counterparts, and add the Duration column so I know if I cut a warmup
        short.
      </Text>
      <Center maxWidth="100%">
        <Image src="/custom-bot-training.png" alt="Custom Bot Training"></Image>
      </Center>
      <Text>
        Our URL will now contain a bunch of numbers that describe the column
        layout I&apos;ve selected. In this case, it looks like so:{' '}
        <Code wordBreak="break-all">
          &columns=11641134627437484456082978756924276810
        </Code>{' '}
        Fun fact, there are currently 193 different columns you can activate,
        and that jumble of numbers can represent any combination you choose.
        There are 2<sup>193</sup> possibilities to choose from!
      </Text>
      <Text>
        Query&apos;s looking good. I&apos;ll be on the HCS circuit in no time (I
        hear Complexity might have a roster slot open).
      </Text>
      <Text>
        Note that query URLs are inherently tied to whatever gamertag
        you&apos;re currently querying. If you share the query with someone
        else, it&apos;ll load up whatever gamertag you were looking at when you
        ran the query, so if someone wants to run the query for their account
        instead, they&apos;ll need to change the gamertag once the page loads.
      </Text>
    </>
  );
}

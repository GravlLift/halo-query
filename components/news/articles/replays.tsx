import { Link, Text, Center, Image } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';

export default function Replays() {
  return (
    <>
      <Text>
        If you've been paying attention recently, you&apos;ve probably seen that
        the Halo Infinite development community has cracked the code for reading
        film files, and as a result there have been a number of applications
        showing up in the past few weeks. I think replays are a really useful
        tool for analyzing matches, so I went ahead and put together replay
        viewer for Halo Query too.
      </Text>
      <Text>
        When browsing Halo Query on desktop, you will now see a "Watch Replay"
        button to open the replay viewer on any match page.
      </Text>
      <Center maxWidth="100%">
        <Image src="/replay-button.png" alt="Replay Button"></Image>
      </Center>
      <Text>
        Replays are a work in progress. The film format is undocumented, so some
        things are still inferred rather than read directly. If you spot a match
        that looks off, let me know in the{' '}
        <Link href="https://discord.com/invite/XuZsWZ2h5p">
          Discord <ExternalLink />
        </Link>
        .
      </Text>
      <Text>
        None of this would exist without the Halo reverse engineering community.
        The groundwork for reading Halo Infinite film files was laid by Den
        Delimarsky (DenD). I encourage you to check out his implementation of
        the replay viewer over at{' '}
        <Link href="https://films.openspartan.com/">
          OpenSpartan Films
          <ExternalLink />
        </Link>
        .
      </Text>
      <Text>
        However, since DenD tends to keep his research close to his chest, the
        real hero here is the open source work produced by JGtm for{' '}
        <Link href="https://github.com/JGtm/LevelUp">
          LevelUp
          <ExternalLink />
        </Link>
        . It was an invaluable reference helping me understand the replay format
        for the TypeScript parser behind this feature. Thank you both.
      </Text>
      <Text>
        Continuing the open source spirit, the parser and the map data are both
        available on Github if you&apos;d like to use or build on them:{' '}
        <Link href="https://github.com/GravlLift/halo-film">
          halo-film
          <ExternalLink />
        </Link>{' '}
        and{' '}
        <Link href="https://github.com/GravlLift/halo-infinite-maps">
          halo-infinite-maps
          <ExternalLink />
        </Link>
        .
      </Text>
    </>
  );
}

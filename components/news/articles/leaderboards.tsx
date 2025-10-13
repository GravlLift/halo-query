import { Center, Image, Link, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

export default function Leaderboards() {
  return (
    <>
      <Text>
        With the patch today, we now have 4 ranked playlists to choose from (3
        permanent and one rotating). To celebrate the occasion, I&apos;m pleased
        to announce the addition of public{' '}
        <Link asChild>
          <NextLink href="/leaderboard">ESR and CSR leaderboards</NextLink>
        </Link>{' '}
        to the site.
      </Text>
      <Center maxWidth="100%">
        <Image src="/leaderboard.png" alt="Leaderboards"></Image>
      </Center>
      <Text mt={2}>
        The leaderboards will track any CSR or ESR that is seen by Halo Query in
        a match played in the last 7 days. That includes players beyond the ones
        that were explicitly being searched for &mdash; anyone who was involved
        in the match will get their skill levels added to the leaderboard. That
        means when you load up your profile page and your 200 most recent
        matches are fetched to render your skill charts, almost 1600 entries are
        potentially being added to the leaderboard.
      </Text>
      <Text>
        That graph at the top of the board shows the distribution of skills as
        recorded by Halo Query. Each bar can be clicked to jump to the
        corresponding page in the leaderboard.
      </Text>
      <Text>
        If you&apos;re logged in to Halo Query, you&apos;ll also see a new
        &quot;Leaderboard&quot; button in the player search and your user menu.
        Clicking this will jump you directly to that player&apos;s page on the
        leaderboard.
      </Text>
      <Text>
        However, being logged in is not a requirement to view the page, so share
        the link as much as you like. Happy grinding!
      </Text>
    </>
  );
}

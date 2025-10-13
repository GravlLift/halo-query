'use client';
import { Box, Link, VStack } from '@chakra-ui/react';
import { redirect } from 'next/navigation';
import { useEffect } from 'react';
import { latest3ArticleIds, postMap } from './news';
import NextLink from 'next/link';
import { useFocusPlayer } from '../lib/contexts/focus-player-context';

export default function Index() {
  const { setFocusPlayer } = useFocusPlayer();
  useEffect(() => {
    setFocusPlayer(null);
  }, [setFocusPlayer]);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment || latest3ArticleIds.includes(fragment)) {
      return;
    }

    const article = postMap[fragment];
    if (article != null) {
      redirect(`/news/${fragment}`);
    }
  }, []);
  return (
    <VStack py={2} gap={2} align="stretch">
      {latest3ArticleIds.map((id) => {
        const ArticleComponent = postMap[id];
        return <ArticleComponent key={id} />;
      })}
      <Box w="100%" textAlign="right">
        <Link asChild>
          <NextLink href="/news">More News...</NextLink>
        </Link>
      </Box>
    </VStack>
  );
}

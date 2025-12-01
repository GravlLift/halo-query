'use client';
import { Box, Button, Center, Flex, Link, Text } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import NProgress from 'nprogress';
import { useReadLocalStorage } from '../../lib/hooks/local-storage';
import {
  getMatchPage,
  getNextAndPreviousMatch,
} from '../../lib/match-query/match-pages';
import { useNavigationController } from '../navigation-context';
import { toaster } from '../ui/toaster';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import type { JsonLogicTree } from '@react-awesome-query-builder/ui';
import { useMemo } from 'react';

function focusPlayerCoalesce(focusPlayer: string | string[]): string {
  if (Array.isArray(focusPlayer)) {
    return focusPlayer[0];
  } else {
    return focusPlayer;
  }
}

export function NavigationButtons(props: {
  focusPlayerPromise: Promise<string | string[]>;
  matchId: string;
  filters: string | undefined;
}) {
  const router = useRouter();
  const haloCaches = useHaloCaches();
  const { signal: navigationStartSignal, abort } = useNavigationController();
  const pageSize = useReadLocalStorage<number>('matches.pageSize') ?? 25;

  const filters: JsonLogicTree | undefined = useMemo(() => {
    if (props.filters) {
      try {
        return JSON.parse(props.filters);
      } catch (e) {
        return undefined;
      }
    } else {
      return undefined;
    }
  }, [props.filters]);
  return (
    <Flex>
      <Box>
        <Button
          onClick={async () => {
            NProgress.start();
            try {
              const user = await haloCaches.usersCache.get(
                focusPlayerCoalesce(await props.focusPlayerPromise),
                navigationStartSignal
              );
              const { previous } = await getNextAndPreviousMatch(
                user.xuid,
                props.matchId,
                pageSize,
                navigationStartSignal,
                filters,
                haloCaches
              );
              if (previous == null) {
                NProgress.done();
                if (!toaster.isVisible('no-previous-match')) {
                  toaster.create({
                    id: 'no-previous-match',
                    title: 'No Previous Match',
                    description: `This is the last match in your query.`,
                    duration: 3000,
                  });
                }
              } else {
                let url = `/matches/${previous.MatchId}`;
                if (props.filters) {
                  url += `?filters=${props.filters}`;
                }
                abort('Navigating to previous match');
                router.push(url);
              }
            } catch (e) {
              if (!(e instanceof DOMException && e.name === 'AbortError')) {
                throw e;
              }
            } finally {
              NProgress.done();
            }
          }}
        >
          <ChevronLeftIcon />
          <Text hideBelow="md">Previous Match</Text>
        </Button>
      </Box>
      <Center flex={1} height={'40px'}>
        <Button
          variant={'plain'}
          onClick={async () => {
            NProgress.start();
            try {
              const focusPlayer = focusPlayerCoalesce(
                await props.focusPlayerPromise
              );
              const user = await haloCaches.usersCache.get(
                focusPlayer,
                navigationStartSignal
              );
              let page: number;
              if (filters) {
                // TODO: Handle filter return to paging
                page = 0;
              } else {
                page = await getMatchPage(
                  user.xuid,
                  props.matchId,
                  pageSize,
                  navigationStartSignal,
                  filters,
                  haloCaches
                );
              }
              let url = `/matches?gamertag=${focusPlayer}&page=${page + 1}`;
              if (props.filters) {
                url += `&filters=${props.filters}`;
              }
              abort('Returning to match list');
              router.push(url);
            } catch (e) {
              if (!(e instanceof DOMException && e.name === 'AbortError')) {
                throw e;
              }
            } finally {
              NProgress.done();
            }
          }}
          asChild
        >
          <Link>Return to Match List</Link>
        </Button>
      </Center>
      <Box textAlign={'right'}>
        <Button
          onClick={async () => {
            NProgress.start();
            try {
              const user = await haloCaches.usersCache.get(
                focusPlayerCoalesce(await props.focusPlayerPromise)
              );
              const { next } = await getNextAndPreviousMatch(
                user.xuid,
                props.matchId,
                pageSize,
                navigationStartSignal,
                filters,
                haloCaches
              );
              if (next == null) {
                NProgress.done();
                if (!toaster.isVisible('no-next-match')) {
                  toaster.create({
                    id: 'no-next-match',
                    title: 'No Next Match',
                    description: `This is the first match in your query.`,
                    duration: 3000,
                  });
                }
              } else {
                let url = `/matches/${next.MatchId}`;
                if (props.filters) {
                  url += `?filters=${props.filters}`;
                }
                abort('Navigating to next match');
                router.push(url);
              }
            } catch (e) {
              if (!(e instanceof DOMException && e.name === 'AbortError')) {
                throw e;
              }
            } finally {
              NProgress.done();
            }
          }}
        >
          <Text hideBelow="md">Next Match</Text>
          <ChevronRightIcon />
        </Button>
      </Box>
    </Flex>
  );
}

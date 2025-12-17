import {
  Box,
  Button,
  Flex,
  Input,
  Link,
  Popover,
  Table,
  Text,
} from '@chakra-ui/react';
import { abortSignalAny, isAbortError } from '@gravllift/utilities';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DateTime } from 'luxon';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { map } from 'rxjs';
import { useNavigationController } from '../navigation-context';
import { useObservable } from '../../lib/hooks/use-observable';
import {
  usePlaylistEntriesCount,
  useRankedEntries,
} from '../../lib/leaderboard/hooks';
import FragmentLinkTarget from '../fragment-link';
import { useHiveMind } from '../leaderboard-provider/hive-mind-context';
import { useLeaderboard } from '../leaderboard-provider/leaderboard-context';
import GamertagDisplay from '../match/gamertag-display';
import TableLoading from '../table-loading';
import { VerticalCenter } from '../vertical-center';
import { toaster } from '../ui/toaster';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { crawlMatches } from '@gravllift/halo-helpers';
const pageSize = 100;

export default function ListView({
  playlistAssetId,
  page: pageParam,
  gamertag,
  skillProp,
}: {
  page: string | undefined;
  gamertag: string | undefined;
  playlistAssetId: string;
  skillProp: 'csr' | 'esr';
}) {
  const leaderboard = useLeaderboard();
  const haloCaches = useHaloCaches();
  const hiveMind = useHiveMind();
  const peerCount = useObservable(
    hiveMind?.peerStatus$?.pipe(map((p) => Object.keys(p).length)),
    null
  );
  const router = useRouter();
  const { signal: navigationAbortSignal } = useNavigationController();
  const csrEntriesCount = usePlaylistEntriesCount(playlistAssetId);
  const lastPage = useMemo(
    () =>
      csrEntriesCount == null
        ? undefined
        : Math.ceil(csrEntriesCount / pageSize),
    [csrEntriesCount]
  );
  const translatePageParam = useCallback(
    (pp: string | undefined, lp: number | undefined) => {
      try {
        return Math.min(Math.max(1, parseInt(pp ?? '1')), lp || 1);
      } catch {
        // Invalid page number
      }
      return 1;
    },
    []
  );
  const [page, setPage] = useState(() =>
    translatePageParam(pageParam, lastPage)
  );
  useEffect(() => {
    setPage(translatePageParam(pageParam, lastPage));
  }, [pageParam, lastPage, translatePageParam]);
  const [userFetchLoading, setUserFetchLoading] = useState<boolean>(!!gamertag);
  useEffect(() => {
    if (leaderboard) {
      if (gamertag) {
        const abortController = new AbortController();
        const signal = abortSignalAny([
          abortController.signal,
          navigationAbortSignal,
        ]);
        (async () => {
          setUserFetchLoading(true);
          try {
            let gt: string, xuid: string;
            try {
              ({ gamertag: gt, xuid } = await haloCaches.usersCache.get(
                gamertag
              ));
            } catch (e) {
              toaster.create({
                title: `Gamertag  ${gamertag} could not be found`,
                type: 'error',
              });
              return;
            }
            let gamertagIndex = await leaderboard.getGamertagIndex(
              xuid,
              playlistAssetId,
              skillProp,
              signal
            );
            if (gamertagIndex === -1) {
              // Gamertag exists but is not in the leaderboard,
              // so we need to crawl it
              await crawlMatches(xuid, 1, { leaderboard, signal, haloCaches });
              gamertagIndex = await leaderboard.getGamertagIndex(
                xuid,
                playlistAssetId,
                skillProp,
                signal
              );
              if (gamertagIndex === -1) {
                // Gamertag still not found, this gamertag is not on the leaderboard
                const search = new URLSearchParams(window.location.search);
                search.set('page', `1`);
                search.delete('gamertag');
                router.push(`/leaderboard?${search.toString()}`);
                return;
              }
            }
            setHighlight(gt);
            const newPage = Math.floor(gamertagIndex / pageSize);
            setPage(newPage + 1);
          } catch (e) {
            if (isAbortError(e)) {
              return;
            }
            throw e;
          } finally {
            setUserFetchLoading(false);
          }
        })();
        return () => {
          abortController.abort('Component unmounted');
        };
      } else {
        setHighlight(undefined);
      }
    }
  }, [
    gamertag,
    navigationAbortSignal,
    playlistAssetId,
    skillProp,
    router,
    leaderboard,
  ]);

  const { value: entries, loading: dbLoading } = useRankedEntries(
    playlistAssetId,
    {
      offset: pageSize * (page - 1),
      limit: pageSize,
    },
    skillProp
  );

  //#region Gamertag Highlight
  const [highlight, setHighlight] = useState<string>();
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    if (!gamertag) {
      return;
    }

    const gamertagTarget = document.getElementById(
      gamertag.replace(/\s/g, '_')
    );
    if (gamertagTarget) {
      gamertagTarget.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    } else if (tableRef.current) {
      const mutationCallback: MutationCallback = (mutations, observer) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                const gtNode = node.querySelector(
                  `#${gamertag.replace(/\s/g, '_')}`
                );
                if (gtNode) {
                  gtNode.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                  observer.disconnect();
                  return;
                }
              }
            });
          }
        }
      };
      const ob = new MutationObserver(mutationCallback);
      ob.observe(tableRef.current, {
        childList: true,
        subtree: true,
      });
      return () => {
        ob.disconnect();
      };
    }
  }, [tableRef, gamertag]);
  //#endregion

  return (
    <Box maxW="100vw">
      <NavigationControls
        page={userFetchLoading ? null : page}
        lastPage={lastPage}
      />
      <Box overflowX="auto" my={2}>
        <Table.Root size="sm" ref={tableRef}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Rank</Table.ColumnHeader>
              <Table.ColumnHeader>Gamertag</Table.ColumnHeader>
              <Table.ColumnHeader>As Of</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {skillProp === 'csr' ? 'CSR' : 'ESR'}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(!peerCount && !entries?.length) ||
            dbLoading ||
            userFetchLoading ? (
              <TableLoading rows={pageSize} columns={4} />
            ) : (
              entries?.map(
                ({
                  rank,
                  xuid,
                  gamertag: gt,
                  matchDate,
                  [skillProp]: skill,
                  matchId,
                }) => {
                  return (
                    <Table.Row
                      key={xuid}
                      backgroundColor={
                        highlight === gt ? 'yellow.500' : undefined
                      }
                    >
                      <Table.Cell>{rank}</Table.Cell>
                      <Table.Cell>
                        <FragmentLinkTarget id={gt?.replace(/\s/g, '_')} />
                        <GamertagDisplay
                          player={{ gamertag: gt, PlayerId: xuid }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        {matchId ? (
                          <Link asChild>
                            <NextLink
                              href={`/matches/${matchId}`}
                              prefetch={false}
                            >
                              {DateTime.fromMillis(matchDate).toLocaleString(
                                DateTime.DATETIME_SHORT
                              )}
                            </NextLink>
                          </Link>
                        ) : (
                          DateTime.fromMillis(matchDate).toLocaleString(
                            DateTime.DATETIME_SHORT
                          )
                        )}
                      </Table.Cell>
                      <Table.Cell textAlign="end">
                        {matchId ? (
                          <Link asChild>
                            <NextLink
                              href={`/matches/${matchId}`}
                              prefetch={false}
                            >
                              {skill.toFixed(0)}
                            </NextLink>
                          </Link>
                        ) : (
                          skill.toFixed(0)
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                }
              )
            )}
          </Table.Body>
        </Table.Root>
      </Box>
      <NavigationControls
        page={userFetchLoading ? null : page}
        lastPage={lastPage}
      />
    </Box>
  );
}

const buttonWidth = { base: '50px', md: '150px' };
function NavigationControls({
  page,
  lastPage,
}: {
  page: number | null;
  lastPage: number | undefined;
}) {
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [pageOpen, setPageOpen] = useState(false);

  const [searchPageNumber, setSearchPageNumber] = useState('');

  useEffect(() => {
    setSearchPageNumber('');
  }, [pathname, searchParams]);
  return (
    <Flex h={10}>
      {page == null || page > 1 ? (
        <Button
          type="button"
          width={buttonWidth}
          onClick={() => {
            if (page != null) {
              const search = new URLSearchParams(window.location.search);
              search.set('page', `${page - 1}`);
              search.delete('gamertag');
              router.push(`/leaderboard?${search.toString()}`);
            }
          }}
          disabled={page == null}
        >
          <ChevronLeftIcon />
          <Text hideBelow="md">Previous</Text>
        </Button>
      ) : (
        <Box width={buttonWidth} />
      )}
      <VerticalCenter flexGrow={1} textAlign="center">
        {page ? (
          <Popover.Root
            initialFocusEl={() => initialFocusRef.current}
            open={pageOpen}
            onOpenChange={({ open }) => setPageOpen(open)}
          >
            <Popover.Trigger asChild>
              <Button variant="plain">Page {page}</Button>
            </Popover.Trigger>
            <Popover.Positioner>
              <Popover.Content>
                <Popover.Trigger />
                <Popover.Arrow />
                <Popover.Header>
                  <Text as="b">Jump To Page</Text>
                </Popover.Header>
                <Popover.Body>
                  <>
                    <Flex>
                      <Input
                        ref={initialFocusRef}
                        placeholder="Page #"
                        type="number"
                        value={searchPageNumber}
                        onChange={(e) => {
                          setSearchPageNumber(e.target.value);
                        }}
                      />
                    </Flex>
                    <Button
                      onClick={async () => {
                        if (searchPageNumber) {
                          const search = new URLSearchParams(
                            window.location.search
                          );
                          search.set('page', searchPageNumber);
                          search.delete('gamertag');
                          router.push(`/leaderboard?${search.toString()}`);
                          setPageOpen(false);
                        }
                      }}
                    >
                      Go
                    </Button>
                  </>
                </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Popover.Root>
        ) : null}
      </VerticalCenter>
      {lastPage != null && (page == null || page - 1 < lastPage) ? (
        <Button
          type="button"
          width={buttonWidth}
          onClick={() => {
            if (page != null) {
              const search = new URLSearchParams(window.location.search);
              search.set('page', `${page + 1}`);
              search.delete('gamertag');
              router.replace(`/leaderboard?${search.toString()}`);
            }
          }}
          disabled={page == null}
        >
          <Text hideBelow="md">Next</Text>
          <ChevronRightIcon />
        </Button>
      ) : (
        <Box width={buttonWidth} />
      )}
    </Flex>
  );
}

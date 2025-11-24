'use client';
import {
  Box,
  ButtonGroup,
  Flex,
  Icon,
  IconButton,
  Link,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { createRef, useEffect, useMemo, useRef } from 'react';
import { FaChartLine, FaTable } from 'react-icons/fa';
import {
  Subject,
  combineLatest,
  debounceTime,
  exhaustMap,
  filter,
  first,
  map,
  startWith,
  switchMap,
} from 'rxjs';
import { useApiClients } from '../../lib/contexts/api-client-contexts';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { useObservable } from '../../lib/hooks/use-observable';
import { ResultsList } from './results-list';
import SearchInput from './search-input';
import { waypointXboxRequestPolicy } from '../../lib/request-policy';

export default function PlayerSearch() {
  const { fullUsersCache } = useHaloCaches();
  const { xboxClient, xboxAuthClient } = useApiClients();
  const pathname = usePathname();

  const { focusPlayer: defaultValue } = useFocusPlayer();

  const textFieldValue$ = useRef(new Subject<string>());
  const results$ = useMemo(() => {
    const trimmedSearch$ = textFieldValue$.current.pipe(
      map((search) => search.trim())
    );
    return combineLatest([
      trimmedSearch$.pipe(map((search) => search.toLowerCase())),
      trimmedSearch$.pipe(
        filter((search) => !!search),
        debounceTime(200),
        switchMap((search) =>
          waypointXboxRequestPolicy
            .execute((ctx) =>
              xboxClient.searchUsers(search, 5, { signal: ctx.signal })
            )
            .catch(() => [])
        ),
        startWith(
          [] as {
            xuid: string;
            gamertag: string;
            displayPicRaw: string | undefined;
          }[]
        )
      ),
      trimmedSearch$.pipe(
        first((search) => !!search),
        exhaustMap(() => xboxAuthClient.getCurrentGamertag()),
        switchMap((userGamertag) =>
          fullUsersCache.get(userGamertag).catch(() => undefined)
        ),
        startWith(undefined)
      ),
      trimmedSearch$.pipe(
        filter((search) => !!search),
        switchMap((search) =>
          fullUsersCache.get(search).catch(() => undefined)
        ),
        startWith(undefined)
      ),
    ]).pipe(
      map(
        ([trimmedLowercaseKeyword, searchResults, currentUser, searchUser]) => {
          if (!trimmedLowercaseKeyword) {
            return [];
          }

          const results: {
            xuid: string;
            gamertag: string;
            displayPicRaw: string | undefined;
          }[] = [];

          if (
            currentUser?.gamertag
              .toLowerCase()
              .startsWith(trimmedLowercaseKeyword)
          ) {
            // Current user's gamertag is a partial
            // search match, add it as the second entry in the list
            results.push({
              xuid: currentUser.xuid,
              gamertag: currentUser.gamertag,
              displayPicRaw: currentUser.gamerpic.small,
            });
          }

          if (
            searchUser?.gamertag
              .toLowerCase()
              .startsWith(trimmedLowercaseKeyword)
          ) {
            // Search keyword is a user, add it as the first entry in the list
            results.push({
              xuid: searchUser.xuid,
              gamertag: searchUser.gamertag,
              displayPicRaw: searchUser.gamerpic.small,
            });
          }

          // For some reason, not all gamertags appear in suggestions
          return (
            results
              .concat(searchResults)
              // I also don't understand how we could get a null user object here,
              // but the logs don't lie.
              .filter((r) => r?.gamertag)
              .distinct((r1, r2) => r1.gamertag === r2.gamertag)
          );
        }
      )
    );
  }, []);
  const results = useObservable(results$, []);
  const value = useObservable(textFieldValue$.current, '');
  useEffect(() => {
    textFieldValue$.current.next(defaultValue ?? '');
  }, [defaultValue]);

  const inputRef = createRef<HTMLInputElement>();
  return (
    <>
      <Flex>
        <Box>
          {defaultValue && value === defaultValue && (
            <ButtonGroup gap={1}>
              {pathname !== '/matches' && (
                <Link asChild>
                  <NextLink href={'/matches?gamertag=' + defaultValue}>
                    <IconButton
                      aria-label="Matches"
                      title="Matches"
                      variant={'subtle'}
                    >
                      <Icon as={FaTable} />
                    </IconButton>
                  </NextLink>
                </Link>
              )}
              {!pathname.startsWith('/players') && (
                <Link asChild>
                  <NextLink href={'/players/' + defaultValue}>
                    <IconButton
                      aria-label="Profile"
                      title="Profile"
                      variant={'subtle'}
                    >
                      <Icon as={FaChartLine} />
                    </IconButton>
                  </NextLink>
                </Link>
              )}
            </ButtonGroup>
          )}
        </Box>
        <Box flexGrow={1}>
          <SearchInput
            inputRef={inputRef}
            value={value}
            setInputValue={(newValue) => {
              textFieldValue$.current.next(newValue);
            }}
          />
        </Box>
      </Flex>
      <Flex position={'relative'}>
        <ResultsList
          inputRef={inputRef}
          results={results}
          onResultClick={(gamertag) => {
            textFieldValue$.current.next(gamertag);
          }}
        />
      </Flex>
    </>
  );
}

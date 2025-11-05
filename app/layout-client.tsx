'use client';
import { ClientAuthError, ClientAuthErrorCodes } from '@azure/msal-browser';
import {
  Box,
  Card,
  Flex,
  HStack,
  Image,
  Link,
  Spacer,
  useBreakpointValue,
  useDisclosure,
} from '@chakra-ui/react';
import { RequestError } from 'halo-infinite-api';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import NProgress from 'nprogress';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useEventListener } from 'usehooks-ts';
import { CurrentUserHeader } from '../components/current-user-header';
import { HeaderSizeContext } from '../components/header-size';
import InteractionRequiredModal from '../components/interaction-required-modal';
import { NavigationProvider } from '../components/navigation-context';
import { NavigationMenu } from '../components/navigation-menu';
import PlayerSearch from '../components/player-search/player-search';
import PrivacyWarningModal from '../components/privacy-warning-modal';
import { Toaster } from '../components/ui/toaster';
import { VerticalCenter } from '../components/vertical-center';
import { appInsights } from '../lib/application-insights/client';
import '../lib/client-polyfills';

const unloadAbortController = new AbortController();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    unloadAbortController.abort();
  });
}

function shouldIgnoreError(e: Error) {
  return (
    e.name === 'AbortError' ||
    (e instanceof TypeError &&
      e.message ===
        'WeakMap key undefined must be an object or an unregistered symbol' &&
      e.stack?.includes('commandsListener') &&
      e.stack?.includes('executeCommands')) ||
    (e instanceof ClientAuthError &&
      [ClientAuthErrorCodes.networkError].includes(e.errorCode))
  );
}

const PageViewTracker = ({
  hideErrorModal,
}: {
  hideErrorModal: () => void;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    appInsights.trackPageView();
    NProgress.done();
    hideErrorModal();
  }, [pathname, router, searchParams, hideErrorModal]);
  return <></>;
};

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const { open: isErrorModalVisible, onClose: hideErrorModal } =
    useDisclosure();
  const [error, setError] = useState<Error>();
  const errorHandler = useCallback(
    async (e: Error) => {
      let shouldReload = false;
      if (e instanceof RequestError && e.response.status === 401) {
        // Something has gone wrong with auth, clear the cache and force a reload
        shouldReload = true;
      } else if (
        e.name === 'ChunkLoadError' ||
        e.message.startsWith('ChunkLoadError:')
      ) {
        shouldReload = true;
      }

      if (shouldReload) {
        // Prevent infinite reload loop
        const searchParams = new URLSearchParams(location.search);
        if (!searchParams.has('force-reload')) {
          searchParams.set('force-reload', '1');
          location.search = searchParams.toString();
          return;
        }
      }

      if (shouldIgnoreError(e)) {
        return;
      }
      setError(e);
    },
    [setError]
  );
  useEventListener(
    'unhandledrejection',
    (e) => {
      if (e.reason instanceof Error) {
        errorHandler(e.reason);
      }
    },
    undefined,
    { signal: unloadAbortController.signal }
  );
  useEventListener(
    'error',
    (e) => {
      if (e.error instanceof Error) {
        errorHandler(e.error);
      }
    },
    undefined,
    { signal: unloadAbortController.signal }
  );

  const logoFilename = useBreakpointValue({
    base: '/Logomark_Cyan.svg',
    sm: '/Horizontal_Logo_Cyan.svg',
  });

  const [headerHeight, setHeaderHeight] = useState<number>(106);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(() => {
    setHeaderHeight(headerRef.current?.offsetHeight ?? 0);
  }, []);

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.addEventListener('resize', handleResize);

      return () => {
        headerRef.current?.removeEventListener('resize', handleResize);
      };
    }
  }, [headerRef.current]);

  return (
    <Suspense
      fallback={
        <Flex justifyContent="center" alignItems="center" h="100vh">
          <Image src={logoFilename} alt="Title Logo" height="32px" />
        </Flex>
      }
    >
      <NavigationProvider>
        <Toaster />
        <PageViewTracker hideErrorModal={hideErrorModal} />
        <PrivacyWarningModal />
        <InteractionRequiredModal />
        <Card.Root
          position="fixed"
          width="100%"
          zIndex={1000}
          p={2}
          ref={headerRef}
        >
          <Flex justifyContent="center" gap={2}>
            <Box maxW="1000px" w="100%">
              <HStack alignItems={'stretch'}>
                <NavigationMenu />
                <Flex flexDir="column">
                  <Spacer />
                  <Link asChild>
                    <NextLink href="/">
                      <Image
                        src={logoFilename}
                        alt="Title Logo"
                        height="32px"
                      />
                    </NextLink>
                  </Link>
                  <Spacer />
                </Flex>
                <Spacer />
                <VerticalCenter>
                  <CurrentUserHeader />
                </VerticalCenter>
              </HStack>
              <Box mt={2}>
                <PlayerSearch />
              </Box>
            </Box>
          </Flex>
        </Card.Root>
        <HeaderSizeContext.Provider value={headerHeight}>
          <Box pt={`${headerHeight}px`}>{children}</Box>
        </HeaderSizeContext.Provider>
      </NavigationProvider>
    </Suspense>
  );
}

import { Box, Button, Flex, Spinner } from '@chakra-ui/react';
import { useState } from 'react';
import { abortSignalAny } from '@gravllift/utilities';
import { crawlMatches } from '../../lib/crawler';
import { useCurrentUserGamertag } from '../../lib/hooks/current-user';
import { useNavigationController } from '../navigation-context';
import { useLeaderboard } from '../leaderboard-provider/leaderboard-context';
import Testing from '../testing';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';

export default function CrawlButton() {
  const leaderboard = useLeaderboard();
  const haloCaches = useHaloCaches();
  const [isCrawling, setIsCrawling] = useState(false);
  const { signal: navigationStartSignal } = useNavigationController();
  const [abortController, setAbortController] = useState<AbortController>();
  const currentUserGamertag = useCurrentUserGamertag();
  return (
    <Testing>
      {currentUserGamertag ? (
        <Flex>
          <Box>
            <Button
              onClick={async () => {
                if (isCrawling) {
                  setIsCrawling(false);
                  abortController?.abort('User stopped crawl');
                  return;
                } else {
                  setIsCrawling(true);
                  try {
                    const controller = new AbortController();
                    setAbortController(controller);
                    const signal = abortSignalAny([
                      controller.signal,
                      navigationStartSignal,
                    ]);
                    let xuid: string;
                    while (!abortController?.signal.aborted) {
                      const maybeEntry = await leaderboard?.getRandomEntry();
                      if (maybeEntry) {
                        xuid = maybeEntry.xuid;
                      } else {
                        ({ xuid } = await haloCaches.usersCache.get(
                          currentUserGamertag,
                          signal
                        ));
                      }

                      try {
                        await crawlMatches(
                          leaderboard,
                          xuid,
                          new Set(),
                          -1,
                          signal,
                          haloCaches
                        );
                      } catch (e) {
                        if (
                          e instanceof DOMException &&
                          e.name === 'AbortError'
                        ) {
                          break;
                        } else {
                          throw e;
                        }
                      }
                    }
                  } finally {
                    setIsCrawling(false);
                  }
                }
              }}
            >
              {isCrawling ? 'Stop' : 'Start'} Crawl
            </Button>
          </Box>
          <Box h="40px" pt="8px" ml={2}>
            {isCrawling ? <Spinner /> : null}
          </Box>
        </Flex>
      ) : null}
    </Testing>
  );
}

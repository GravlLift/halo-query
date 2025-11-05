import { Box, Flex, Link, Skeleton } from '@chakra-ui/react';
import { showOpenFilePicker } from 'file-system-access';
import { Ban } from 'lucide-react';
import NextLink from 'next/link';
import { MutableRefObject } from 'react';
import Testing from '../testing';

export default function GamertagDisplay({
  matchId,
  player,
  fileHandleRef,
}: {
  matchId?: string;
  player: { gamertag?: string; PlayerId: string };
  fileHandleRef?: MutableRefObject<FileSystemFileHandle | null>;
}) {
  return (
    <Flex>
      <Box>
        {player.PlayerId?.startsWith('bid') ? (
          <>Bot</>
        ) : player.gamertag ? (
          <>
            <Link asChild cursor={'pointer'}>
              <NextLink prefetch={false} href={'/players/' + player.gamertag}>
                {player.gamertag}
              </NextLink>
            </Link>
            {matchId && fileHandleRef && (
              <Testing>
                <Box hideBelow="lg" pl={1}>
                  {player.gamertag !== 'GravlLift' ? (
                    <Ban
                      cursor={'pointer'}
                      onClick={async () => {
                        if (!player.PlayerId) return;

                        if (fileHandleRef.current == null) {
                          try {
                            const [newHandle] = await showOpenFilePicker({
                              id: 'blacklist',
                            } as Parameters<typeof showOpenFilePicker>[0]);

                            await newHandle.requestPermission({
                              mode: 'readwrite',
                            });
                            fileHandleRef.current = newHandle;
                          } catch (e) {
                            return;
                          }
                        }

                        const fileData = await fileHandleRef.current.getFile();
                        const blackList: Record<
                          string,
                          {
                            matchId?: string;
                            reason?: string;
                            gamertag?: string;
                          }
                        > = JSON.parse(await fileData.text());

                        const reason = window.prompt('Blacklist reason');

                        if (reason == null) {
                          return;
                        }

                        blackList[player.PlayerId] = {
                          gamertag: player.gamertag,
                          matchId,
                        };
                        if (reason) {
                          blackList[player.PlayerId].reason = reason;
                        }

                        const writable =
                          await fileHandleRef.current.createWritable();
                        await writable.write(
                          JSON.stringify(blackList, null, 2)
                        );
                        await writable.close();
                      }}
                    />
                  ) : null}
                </Box>
              </Testing>
            )}
          </>
        ) : (
          <Skeleton
            height="20px"
            width="100%"
            minW="100px"
            title={player.PlayerId}
          />
        )}
      </Box>
    </Flex>
  );
}

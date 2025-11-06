import { Box, Link, Skeleton } from '@chakra-ui/react';
import NextLink from 'next/link';

export default function GamertagDisplay({
  player,
}: {
  player: { gamertag?: string; PlayerId: string };
}) {
  return (
    <Box w="100%" whiteSpace={['nowrap']}>
      {player.PlayerId?.startsWith('bid') ? (
        <>Bot</>
      ) : player.gamertag ? (
        <>
          <Link asChild cursor={'pointer'}>
            <NextLink prefetch={false} href={'/players/' + player.gamertag}>
              {player.gamertag}
            </NextLink>
          </Link>
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
  );
}

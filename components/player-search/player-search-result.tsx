import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  ButtonGroup,
  Flex,
  Link,
  Spacer,
} from '@chakra-ui/react';
import NextLink from 'next/link';

export default function PlayerSearchResult({
  user,
  onResultClick,
}: {
  user: { gamertag: string; displayPicRaw: string | undefined };
  onResultClick?: () => void;
}) {
  return (
    <Flex flexWrap="wrap" rowGap="20px">
      <Flex justifyContent="flex-start" flexGrow={1}>
        <AvatarGroup>
          <Avatar.Root>
            <Avatar.Fallback />
            <Avatar.Image src={user.displayPicRaw} />
          </Avatar.Root>
        </AvatarGroup>
        <Flex flexGrow={1} ml={2} flexDirection={'column'}>
          <Spacer />
          <Box>{user.gamertag}</Box>
          <Spacer />
        </Flex>
      </Flex>
      <Flex justifyContent={'flex-end'} flexDirection={'column'}>
        <Spacer />
        <Flex justifyContent={'flex-end'}>
          <ButtonGroup>
            <Link asChild>
              <NextLink
                href={'/matches?gamertag=' + user.gamertag}
                onClick={() => onResultClick && onResultClick()}
              >
                <Button type="button">Matches</Button>
              </NextLink>
            </Link>
            <Link asChild>
              <NextLink
                href={'/players/' + user.gamertag}
                onClick={() => onResultClick && onResultClick()}
              >
                <Button type="button">Profile</Button>
              </NextLink>
            </Link>
            <Link asChild>
              <NextLink
                href={'/leaderboard?gamertag=' + user.gamertag}
                onClick={() => onResultClick && onResultClick()}
              >
                <Button type="button">Leaderboard</Button>
              </NextLink>
            </Link>
          </ButtonGroup>
        </Flex>
        <Spacer />
      </Flex>
    </Flex>
  );
}

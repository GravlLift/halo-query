'use client';
import { Avatar, Box, Button, Icon, Menu, Portal } from '@chakra-ui/react';
import NextLink from 'next/link';
import NProgress from 'nprogress';
import { useState } from 'react';
import { FaChartLine, FaSignOutAlt, FaTable } from 'react-icons/fa';
import { FaRankingStar } from 'react-icons/fa6';
import { Loading } from '../components/loading';
import '../lib/client-polyfills';
import { useAuthentication } from '../lib/contexts/authentication-contexts';
import {
  useCurrentUser,
  useCurrentUserGamertag,
} from '../lib/hooks/current-user';
import { useApiClients } from '../lib/contexts/api-client-contexts';

export function CurrentUserHeader() {
  const gamertag = useCurrentUserGamertag();
  const currentUser = useCurrentUser();
  const { logout } = useAuthentication();
  const { xboxAuthClient } = useApiClients();
  // Gamertag has not been loaded from local storage,
  // or gamertag is known but user details have not been loaded yet
  const isLoading =
    gamertag === undefined || (gamertag !== null && !currentUser);
  const [gamerpicLoaded, setGamerpicLoaded] = useState(false);

  return (
    <Box>
      {isLoading ? (
        <Loading />
      ) : gamertag === null ? (
        <Avatar.Root
          size="md"
          cursor="pointer"
          onClick={async () => {
            await xboxAuthClient.getCurrentGamertag();
          }}
        >
          <Avatar.Fallback />
          <Avatar.Image />
        </Avatar.Root>
      ) : (
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button variant="plain" px={0}>
              <Avatar.Root
                size="md"
                backgroundColor={gamerpicLoaded ? 'transparent' : undefined}
              >
                <Avatar.Fallback name={gamertag} />
                <Avatar.Image
                  src={currentUser?.gamerpic.small}
                  onLoad={() => {
                    setGamerpicLoaded(true);
                  }}
                />
              </Avatar.Root>
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item asChild value={'matches'} cursor={'pointer'}>
                  <NextLink href={'/matches?gamertag=' + gamertag}>
                    <Icon as={FaTable} />
                    Matches
                  </NextLink>
                </Menu.Item>
                <Menu.Item asChild value="profile" cursor={'pointer'}>
                  <NextLink href={'/players/' + gamertag}>
                    <Icon as={FaChartLine} />
                    Profile
                  </NextLink>
                </Menu.Item>
                <Menu.Item asChild value="leaderboard" cursor={'pointer'}>
                  <NextLink href={'/leaderboard?gamertag=' + gamertag}>
                    <Icon as={FaRankingStar} />
                    Leaderboard
                  </NextLink>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  value="logout"
                  onClick={() => {
                    NProgress.start();
                    return logout();
                  }}
                  cursor={'pointer'}
                >
                  <Icon as={FaSignOutAlt} />
                  Logout
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}
    </Box>
  );
}

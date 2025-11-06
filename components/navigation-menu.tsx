'use client';
import {
  Box,
  Button,
  Center,
  CloseButton,
  Drawer,
  Flex,
  Icon,
  IconButton,
  Image,
  Link,
  Portal,
  StackSeparator,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { Menu } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import {
  FaChartLine,
  FaDiscord,
  FaGithub,
  FaHome,
  FaNpm,
  FaPaypal,
  FaQuestion,
  FaReddit,
  FaTable,
} from 'react-icons/fa';
import { FaRankingStar } from 'react-icons/fa6';
import { IconType } from 'react-icons/lib';
import { useNavigationController } from './navigation-context';
import CircleIcon from './circle-icon';
import { VerticalCenter } from './vertical-center';
import { useFocusPlayer } from '../lib/contexts/focus-player-context';

const NavigationItem = ({
  isSelected,
  href,
  label,
  icon,
}: {
  isSelected: boolean;
  href: string;
  label: string;
  icon: IconType;
}) => (
  <Box>
    <Link asChild>
      <NextLink href={href}>
        <Icon as={icon} mr={2} boxSize={3} />
        {label}
        {isSelected ? <CircleIcon boxSize={2} marginLeft={2} /> : null}
      </NextLink>
    </Link>
  </Box>
);

export function NavigationMenu() {
  const pathname = usePathname();
  const { open, onClose, onOpen } = useDisclosure();
  const btnRef = useRef<HTMLButtonElement>(null);
  const { focusPlayer } = useFocusPlayer();
  return (
    <>
      <Suspense>
        <NavStartClose onClose={onClose} />
      </Suspense>
      <Drawer.Root
        open={open}
        onOpenChange={(details) => (details.open ? onOpen() : onClose())}
        placement="start"
      >
        <Drawer.Trigger asChild>
          <IconButton
            aria-label="Menu"
            ref={btnRef}
            onClick={onOpen}
            variant={'plain'}
          >
            <Menu size={6} />
          </IconButton>
        </Drawer.Trigger>
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="md" variant="ghost" />
              </Drawer.CloseTrigger>
              <Drawer.Header>
                <Link asChild>
                  <NextLink href="/">
                    <VerticalCenter>
                      <Image
                        src="/Horizontal_Logo_Cyan.svg"
                        alt="Title Logo"
                        width="240px"
                      />
                    </VerticalCenter>
                  </NextLink>
                </Link>
              </Drawer.Header>
              <Drawer.Body>
                <VStack
                  separator={<StackSeparator borderColor="gray.500" />}
                  gap={2}
                  align="stretch"
                >
                  <NavigationItem
                    isSelected={pathname === '/'}
                    href="/"
                    label="Home"
                    icon={FaHome}
                  />
                  {focusPlayer && (
                    <NavigationItem
                      isSelected={pathname.startsWith('/matches')}
                      href={'/matches?gamertag=' + focusPlayer}
                      label="Matches"
                      icon={FaTable}
                    />
                  )}
                  {focusPlayer && (
                    <NavigationItem
                      isSelected={pathname.startsWith('/players')}
                      href={'/players/' + focusPlayer}
                      label="Profile"
                      icon={FaChartLine}
                    />
                  )}
                  <NavigationItem
                    isSelected={pathname === '/leaderboard'}
                    href="/leaderboard"
                    label="Leaderboard"
                    icon={FaRankingStar}
                  />
                  <NavigationItem
                    isSelected={pathname === '/faqs'}
                    href="/faqs"
                    label="FAQs"
                    icon={FaQuestion}
                  />
                </VStack>
              </Drawer.Body>
              <Drawer.Footer>
                <Flex width="100%" direction="column" gap={4}>
                  <Center width="100%">
                    <Link asChild>
                      <NextLink
                        href="https://www.paypal.com/donate/?hosted_button_id=4KNG4S2NTJGRA"
                        prefetch={false}
                        target="_blank"
                      >
                        <Button
                          borderRadius={50}
                          height={6}
                          colorPalette="yellow"
                        >
                          Buy GravlLift a Beer
                          <FaPaypal />
                        </Button>
                      </NextLink>
                    </Link>
                  </Center>
                  <Flex width="100%" justifyContent="space-evenly">
                    <Box>
                      <Link
                        target="_blank"
                        href="https://www.reddit.com/user/HaloQuery"
                        title="Halo Query on Reddit"
                      >
                        <Icon as={FaReddit} boxSize={8} />
                      </Link>
                    </Box>
                    <Box>
                      <Link
                        target="_blank"
                        href="https://discord.gg/XuZsWZ2h5p"
                        title="Halo Query on Discord"
                      >
                        <Icon as={FaDiscord} boxSize={8} />
                      </Link>
                    </Box>
                    <Box>
                      <Link
                        target="_blank"
                        href="https://www.github.com/GravlLift/halo-query"
                        title="Halo Query on Github"
                      >
                        <Icon as={FaGithub} boxSize={8} />
                      </Link>
                    </Box>
                    <Box>
                      <Link
                        target="_blank"
                        href="https://www.npmjs.com/package/halo-infinite-api"
                        title="Powered by halo-infinite-api"
                      >
                        <Icon as={FaNpm} boxSize={8} />
                      </Link>
                    </Box>
                  </Flex>
                </Flex>
              </Drawer.Footer>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </>
  );
}

function NavStartClose({ onClose }: { onClose: () => void }) {
  const { signal: navStartSignal } = useNavigationController();
  useEffect(() => {
    navStartSignal.addEventListener('abort', onClose);
    return () => {
      navStartSignal.removeEventListener('abort', onClose);
    };
  }, [navStartSignal, onClose]);
  return <></>;
}

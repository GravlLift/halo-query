import { CircleAlert, ExternalLink, TriangleAlert } from 'lucide-react';
import {
  Box,
  Button,
  ButtonGroup,
  Center,
  Link,
  Dialog,
  Text,
} from '@chakra-ui/react';
import { RequestError } from 'halo-infinite-api';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { useCurrentUserGamertag } from '../lib/hooks/current-user';
import { Loading } from './loading';

type DeniedError =
  | { type: 'blacklist'; reason: string }
  | { type: 'whitelist' };

export default function ErrorModal(props: {
  isOpen: boolean;
  error: (Error & { digest?: string }) | undefined;
}) {
  const [isDeniedError, setIsDeniedError] = useState<
    DeniedError | false | undefined
  >(undefined);
  useEffect(() => {
    (async () => {
      if (
        props.error instanceof RequestError &&
        props.error.response?.status === 403 &&
        props.error.response?.url?.endsWith('/xsts/authorize')
      ) {
        const result = await props.error.response.json();
        if (
          'type' in result &&
          ['whitelist', 'blacklist'].includes(result.type)
        )
          setIsDeniedError(result as DeniedError);
        return;
      }
      setIsDeniedError(false);
    })();
  }, [props.error]);
  const currentUser = useCurrentUserGamertag();
  return (
    <Dialog.Root
      closeOnInteractOutside={false}
      open={props.isOpen}
      placement="center"
      size="xl"
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          {isDeniedError === undefined ? (
            <Loading />
          ) : !isDeniedError ? (
            <>
              <Dialog.Header>
                <Dialog.Title>
                  Looks like something&apos;s broken...
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Center mb={2}>
                  <CircleAlert size={32} color={'yellow.500'} />
                </Center>
                {props.error instanceof RequestError ? (
                  <>
                    <Text>
                      Maybe I did this, maybe this is Halo&apos;s fault. Either
                      way, I&apos;ve been notified.
                    </Text>
                    <Text mt={2}>
                      If you want to know for sure if this is on me, go to your
                      Halo Waypoint Service Record and click the tab labeled
                      &quot;Stats&quot;. If it loads without issue, that means
                      this problem is my fault, and you should yell at me.
                    </Text>
                    <Text mt={2}>
                      But if halowaypoint.com&apos;s busted as well, that&apos;s
                      on them, nothing I can do about Halo&apos;s code. :/
                    </Text>
                  </>
                ) : null}
                <Text>
                  The site owner has been notified. You can try reloading the
                  page, or let me know on the{' '}
                  <Link href="https://discord.gg/XuZsWZ2h5p" target="_blank">
                    Discord server
                    <ExternalLink />
                  </Link>{' '}
                  if this is a recurring issue for you.
                </Text>
                {props.error && (
                  <>
                    <Text mt={2}>Error detail:</Text>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                      {props.error.name}: {props.error.message}
                    </pre>
                  </>
                )}
              </Dialog.Body>
              <Dialog.Footer>
                <ButtonGroup>
                  <Button onClick={() => location.reload()}>Reload</Button>
                  {props.error instanceof RequestError && (
                    <Link asChild>
                      <NextLink
                        href={
                          currentUser
                            ? 'https://www.halowaypoint.com/halo-infinite/players/' +
                              currentUser
                            : 'https://www.halowaypoint.com/halo-infinite/progression'
                        }
                        target="_blank"
                      >
                        <Button>
                          halowaypoint.com
                          <ExternalLink />
                        </Button>
                      </NextLink>
                    </Link>
                  )}
                </ButtonGroup>
              </Dialog.Footer>
            </>
          ) : (
            <>
              <Dialog.Header>Access Denied</Dialog.Header>
              <Dialog.Body>
                <Center mb={2}>
                  <TriangleAlert size={32} color={'red.500'} />
                </Center>
                <Box>
                  {isDeniedError.type === 'blacklist' ? (
                    <Box>
                      <Text>
                        You have been banned from this platform for the
                        following reason:
                      </Text>
                      <pre style={{ width: '100%', whiteSpace: 'pre-wrap' }}>
                        {isDeniedError.reason}
                      </pre>
                    </Box>
                  ) : (
                    'This account is not on the whitelist, please try again after we officially launch!'
                  )}
                </Box>
              </Dialog.Body>
            </>
          )}
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

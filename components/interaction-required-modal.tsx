'use client';
import { ServerError } from '@azure/msal-browser';
import { ExternalLink } from 'lucide-react';
import { Box, Button, Icon, Link, Dialog, CloseButton } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FaMicrosoft } from 'react-icons/fa';
import { useAuthentication } from '../lib/contexts/authentication-contexts';
import { useCurrentUser } from '../lib/hooks/current-user';
import { appInsights } from '../lib/application-insights/client';

export default function InteractionRequiredModal() {
  const { interaction } = useAuthentication();
  const canAbort = interaction && 'abort' in interaction ? true : false;
  const [navigating, setNavigating] = useState<boolean>(false);

  const ssoButtonRef = useRef<HTMLButtonElement>(null);

  const handleProceed = async () => {
    if (navigating || !interaction) return; // Prevent multiple clicks

    setNavigating(true);
    try {
      await interaction.resolve();
    } catch (error) {
      console.error('Authentication redirect failed:', error);
      // The context will handle resetting the state and rejecting the promise
    } finally {
      setNavigating(false);
    }
  };
  const isOpen = !!interaction;
  useEffect(() => {
    if (isOpen) {
      appInsights.trackEvent({
        name: 'InteractionRequiredModalOpened',
      });
    }
  }, [isOpen]);

  return (
    <Dialog.Root
      open={isOpen}
      placement={'center'}
      initialFocusEl={() => ssoButtonRef.current}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Microsoft Authentication Required</Dialog.Title>
            {canAbort && (
              <Dialog.CloseTrigger asChild>
                <CloseButton
                  onClick={() => {
                    if (interaction?.abort) {
                      interaction.abort();
                    }
                  }}
                />
              </Dialog.CloseTrigger>
            )}
          </Dialog.Header>
          <Dialog.Body>
            <Box>
              In order to perform requests against halowaypoint.com&apos;s API,
              you must authenticate with your Microsoft account. You will be
              redirected to a Microsoft-controlled site to complete the
              authentication, and Halo Query will receive a short-term token the
              make requests on your behalf. The token will be persisted in your
              browser&apos;s local storage, so you should not need to
              re-authenticate on future visits.
            </Box>
            <Box mt={2}>
              If, at any time in the future, you wish to revoke the access you
              are about to grant, Microsoft provides a control panel to do so{' '}
              <Link asChild>
                <NextLink
                  href="https://account.live.com/consent/Manage"
                  target="_blank"
                >
                  here
                  <ExternalLink />
                </NextLink>
              </Link>
              .
            </Box>
            <Box mt={2}>
              {interaction?.authError &&
              interaction.authError instanceof ServerError &&
              interaction.authError.errorCode === 'access_denied' ? (
                <b>
                  Make sure you actually grant the meager permissions that the
                  SSO screen asks you for, otherwise the site won&apos;t
                  function, and you&apos;ll just keep seeing this screen.
                </b>
              ) : (
                <b>Your account details will never be saved on our servers.</b>
              )}
            </Box>
          </Dialog.Body>
          <Dialog.Footer>
            <Button
              ref={ssoButtonRef}
              loading={navigating}
              onClick={handleProceed}
            >
              <Icon as={FaMicrosoft} />
              Proceed to Microsoft SSO
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

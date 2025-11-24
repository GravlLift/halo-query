'use client';
import { Button, Dialog, Link, Text, useDisclosure } from '@chakra-ui/react';
import { Privacy } from 'halo-infinite-api';
import NextLink from 'next/link';
import { useEffect } from 'react';
import { useApiClients } from '../lib/contexts/api-client-contexts';
import { useCurrentUser } from '../lib/hooks/current-user';
import { localStorageEvent } from '../lib/local-storage/event-based-localstorage';
import { waypointXboxRequestPolicy } from '../lib/requestPolicy';

export default function PrivacyWarningModal() {
  const currentUser = useCurrentUser();
  const { haloInfiniteClient } = useApiClients();
  const { open, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    const ignore = localStorageEvent.getItem('privacy-warning');
    if (ignore === 'ignore' || !currentUser) {
      return;
    }

    const abortController = new AbortController();
    waypointXboxRequestPolicy
      .execute(
        (ctx) =>
          haloInfiniteClient.getMatchesPrivacy(currentUser.xuid, {
            signal: ctx.signal,
          }),
        abortController.signal
      )
      .then((privacy) => {
        if (
          privacy.MatchmadeGames === Privacy.Hide ||
          privacy.OtherGames === Privacy.Hide
        ) {
          onOpen();
        }
      });
    return () => {
      abortController.abort();
    };
  }, [onOpen, currentUser?.xuid]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) {
          onClose();
        }
      }}
      placement={'center'}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Match Privacy Warning</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger />
          <Dialog.Body>
            <Text>
              Your current match privacy settings may prevent Halo Query (and
              everyone else) from showing all your matches.
            </Text>
            <Text mt={2}>
              You can change your privacy settings at{' '}
              <Link asChild>
                <NextLink
                  href="https://www.halowaypoint.com/settings/privacy"
                  target="_blank"
                >
                  https://www.halowaypoint.com/settings/privacy
                </NextLink>
              </Link>
              .
            </Text>
          </Dialog.Body>
          <Dialog.Footer>
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                localStorageEvent.setItem('privacy-warning', 'ignore');
              }}
            >
              Don&apos;t show this again
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

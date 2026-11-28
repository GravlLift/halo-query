import {
  Dialog,
  HoverCard,
  HStack,
  Portal,
  Progress,
  Text,
} from '@chakra-ui/react';
import { CircleHelp } from 'lucide-react';
import { usePlaylistEntriesCount } from '../../lib/leaderboard/hooks';

export default function PlayerCount({
  playlistAssetId,
}: {
  playlistAssetId: string;
}) {
  const playerCount = usePlaylistEntriesCount(playlistAssetId);
  return playerCount ? (
    <HoverCard.Root>
      <HoverCard.Trigger>
        <HStack align={'right'} cursor="pointer">
          Tracking {playerCount} Players
          <CircleHelp />
        </HStack>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content>
            <HoverCard.Arrow />
            <Text as="b">Which players are tracked?</Text>
            <Text className="paragraph" mb={2}>
              Any player that has been loaded by a user of this site as part of
              a ranked match in the last 7 days is tracked. In other words, for
              every queried match, potentially 8 entries are added to the
              leaderboard.
            </Text>
            <Text className="paragraph" mb={2}>
              If you find that you are not being tracked, or that your
              leaderboard entry is out of date, simply open your player profile
              and the data will update.
            </Text>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  ) : (
    <>
      <Text>Loading...</Text>
      <Dialog.Root
        open={playerCount === 0}
        closeOnInteractOutside={false}
        placement={'center'}
      >
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Downloading Leaderboard Data</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Progress.Root value={null}>
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </>
  );
}

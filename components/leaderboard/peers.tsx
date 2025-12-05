import {
  Grid,
  GridItem,
  HoverCard,
  Portal,
  Progress,
  Text,
} from '@chakra-ui/react';
import { Fragment } from 'react';
import { percentFormatter } from '../../lib/formatters';
import { useObservable } from '../../lib/hooks/use-observable';
import { useHiveMind } from '../leaderboard-provider/hive-mind-context';
import { VerticalCenter } from '../vertical-center';
import { Tooltip } from '../ui/tooltip';
export default function Peers() {
  const hiveMind = useHiveMind();
  const peerStatus = useObservable(hiveMind?.peerStatus$, {});
  const peerCount = Object.keys(peerStatus).length;

  if (!hiveMind?.selfId) {
    return null;
  }

  return (
    <HoverCard.Root>
      <HoverCard.Trigger>
        <Text as="span" cursor="pointer">
          {peerCount} Peers
        </Text>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content>
            <HoverCard.Arrow />
            <Text>Your ID: {hiveMind?.selfId}</Text>
            <Grid templateColumns="repeat(5, 1fr)" columnGap={2}>
              {Object.entries(peerStatus).map(([peerId, status]) => (
                <Fragment key={peerId}>
                  <GridItem
                    colSpan={1}
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    overflow="hidden"
                    title={`Peer ID: ${peerId}`}
                    fontSize="x-small"
                  >
                    {peerId}
                  </GridItem>
                  <GridItem colSpan={4}>
                    <VerticalCenter height="100%">
                      <Tooltip
                        content={
                          status == null
                            ? 'Awaiting data...'
                            : `Receiving data: ${percentFormatter.format(
                                status
                              )}`
                        }
                      >
                        <Progress.Root
                          value={status != null ? status * 100 : null}
                        >
                          <Progress.Track>
                            <Progress.Range />
                          </Progress.Track>
                        </Progress.Root>
                      </Tooltip>
                    </VerticalCenter>
                  </GridItem>
                </Fragment>
              ))}
            </Grid>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  );
}

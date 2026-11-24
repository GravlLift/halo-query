import {
  Box,
  Flex,
  HStack,
  IconButton,
  NumberInput,
  Popover,
  Portal,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { EllipsisVertical, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

function Overlay({ children, bg }: { children: ReactNode; bg: string }) {
  return (
    <Flex
      position="absolute"
      inset={0}
      align="center"
      justify="center"
      gap={2}
      p={2}
      bg={bg}
    >
      {children}
    </Flex>
  );
}

/** Header (title, offset input, remove) and status overlays shared by media items. */
export function MediaItemFrame({
  title,
  offset,
  offsetText,
  onOffsetInput,
  onRemove,
  error,
  notice,
  children,
  isAligning,
}: {
  title: string;
  offset: number | undefined;
  offsetText: string;
  onOffsetInput: (details: { value: string; valueAsNumber: number }) => void;
  onRemove: () => void;
  error?: string;
  notice?: string;
  children: ReactNode;
  isAligning: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Flex direction="column" gap={1} bg="black.800" borderRadius="sm">
      <Box position="relative">
        {children}
        <Text
          position="absolute"
          top={1}
          left={1}
          zIndex={1}
          maxW="calc(100% - 48px)"
          px={2}
          py={0.5}
          borderRadius="sm"
          bg="blackAlpha.700"
          fontSize="sm"
          truncate
          title={title}
          pointerEvents="none"
        >
          {title}
        </Text>
        <Popover.Root
          positioning={{ placement: 'bottom-end' }}
          open={isAligning || menuOpen}
          onOpenChange={({ open }) => setMenuOpen(open)}
          autoFocus={false}
        >
          <Popover.Trigger asChild>
            <IconButton
              position="absolute"
              top={1}
              right={1}
              zIndex={1}
              size="xs"
              variant="subtle"
              aria-label={`Options for ${title}`}
            >
              <EllipsisVertical size={14} />
            </IconButton>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content w="auto">
                <Popover.Body p={2}>
                  <HStack gap={2}>
                    <NumberInput.Root
                      size="xs"
                      w="96px"
                      step={0.2}
                      value={offsetText}
                      disabled={offset === undefined || !isAligning}
                      aria-label={`Offset for ${title} in seconds`}
                      title="Offset (seconds). Positive values play later in the media."
                      onValueChange={onOffsetInput}
                      allowMouseWheel
                    >
                      <NumberInput.Input />
                      <NumberInput.Control />
                    </NumberInput.Root>
                    <IconButton
                      size="xs"
                      aria-label={`Remove ${title}`}
                      onClick={onRemove}
                    >
                      <X size={14} />
                    </IconButton>
                  </HStack>
                </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
        {error ? (
          <Overlay bg="blackAlpha.800">
            <Text role="alert" fontSize="sm" color="red.500" textAlign="center">
              {error}
            </Text>
          </Overlay>
        ) : offset === undefined ? (
          <Overlay bg="blackAlpha.600">
            <Spinner size="sm" />
            <Text fontSize="sm">Aligning to match...</Text>
          </Overlay>
        ) : (
          notice && (
            <Overlay bg="blackAlpha.700">
              <Text fontSize="sm" textAlign="center">
                {notice}
              </Text>
            </Overlay>
          )
        )}
      </Box>
    </Flex>
  );
}

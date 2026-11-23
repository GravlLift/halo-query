import {
  Box,
  Flex,
  HStack,
  IconButton,
  NumberInput,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

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
}: {
  title: string;
  offset: number | undefined;
  offsetText: string;
  onOffsetInput: (details: { value: string; valueAsNumber: number }) => void;
  onRemove: () => void;
  error?: string;
  notice?: string;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" gap={1} bg="black.800" p={2} borderRadius="sm">
      <HStack gap={2}>
        <Text flex={1} minW={0} fontSize="sm" truncate title={title}>
          {title}
        </Text>
        <NumberInput.Root
          size="xs"
          w="96px"
          step={0.2}
          value={offsetText}
          disabled={offset === undefined}
          aria-label={`Offset for ${title} in seconds`}
          title="Offset (seconds). Positive values play later in the media."
          onValueChange={onOffsetInput}
          allowMouseWheel
        >
          <NumberInput.Input />
          <NumberInput.Control />
        </NumberInput.Root>
        <IconButton size="xs" aria-label={`Remove ${title}`} onClick={onRemove}>
          <X size={14} />
        </IconButton>
      </HStack>
      <Box position="relative">
        {children}
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

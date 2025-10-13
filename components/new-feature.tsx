import { StarIcon } from 'lucide-react';
import { HStack, Text } from '@chakra-ui/react';
import { DateTime } from 'luxon';

export function NewFeature({
  modificationDate,
  children,
  explanation,
}: {
  modificationDate: string;
  children: React.ReactNode;
  explanation: string;
}) {
  const _modificationDate = DateTime.fromISO(modificationDate);
  const showNewFeature = _modificationDate.plus({ days: 14 }) > DateTime.now();

  return (
    <HStack
      title={showNewFeature ? 'New/Updated Feature: ' + explanation : undefined}
    >
      <>
        {children}
        {showNewFeature ? (
          <Text as="sup">
            <StarIcon color={'yellow.500'} size={2} />
          </Text>
        ) : null}
      </>
    </HStack>
  );
}

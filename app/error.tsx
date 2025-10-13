'use client';
import { TriangleAlert } from 'lucide-react';
import { Box, Code, Heading, VStack, Button } from '@chakra-ui/react';
import { appInsights } from '../lib/application-insights/client';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: (Error & { digest?: string }) | undefined;
  reset: () => void;
}) {
  useEffect(() => {
    if (error) {
      appInsights.trackException({ exception: error });
    }
  }, [error]);
  return (
    <VStack
      alignItems={'center'}
      height="100vh"
      direction={'column'}
      padding={2}
      gap={5}
    >
      <Box textAlign={'center'}>
        <TriangleAlert size={32} color={'red.500'} />
        <Heading size={'lg'}>
          Something went wrong. The site owner has been notified and will be
          taking a look shortly.
        </Heading>
        <Button onClick={() => reset()}>Reload</Button>
      </Box>
      <Box>
        <div>
          <Heading size={'md'}>Error Details</Heading>
          <Code whiteSpace={'pre-wrap'} width={'100%'}>
            {window.location.href}
          </Code>
          <Code width={'100%'} whiteSpace={'pre-wrap'}>
            {error?.stack}
          </Code>
        </div>
      </Box>
    </VStack>
  );
}

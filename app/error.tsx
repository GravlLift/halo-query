'use client';
import { Box, Button, Code, Heading, VStack } from '@chakra-ui/react';
import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { isUnloading } from '../lib/unload';

export default function Error({
  error,
  reset,
}: {
  error: (Error & { digest?: string }) | undefined;
  reset: () => void;
}) {
  useEffect(() => {
    if (error && !isUnloading) {
      import('../lib/application-insights/client').then(({ appInsights }) => {
        appInsights.trackException({ exception: error });
      });
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

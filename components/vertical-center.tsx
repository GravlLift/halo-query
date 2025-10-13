import { Flex, Spacer, Box } from '@chakra-ui/react';
import { ComponentProps } from 'react';

export function VerticalCenter({
  children,
  ...props
}: { children: React.ReactNode } & Omit<
  ComponentProps<typeof Flex>,
  'flexDir'
>) {
  return (
    <Flex flexDir="column" {...props}>
      <Spacer />
      <Box>{children}</Box>
      <Spacer />
    </Flex>
  );
}

import { Box, Flex } from '@chakra-ui/react';
import Index from '../components/home';

export default function IndexPage() {
  return (
    <Flex justifyContent="center">
      <Box maxW="1000px">
        <Index />
      </Box>
    </Flex>
  );
}

'use client';
import { Box } from '@chakra-ui/react';
import { HeaderSizeContext } from './header-size';
import { useContext } from 'react';

export default function FragmentLinkTarget({ id }: { id: string | undefined }) {
  const headerSize = useContext(HeaderSizeContext);
  return (
    <Box position="relative">
      <Box position="absolute" top={`-${headerSize}px`} id={id} />
    </Box>
  );
}

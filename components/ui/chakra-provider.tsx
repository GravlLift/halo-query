'use client';

import { ChakraProvider as _ChakraProvider } from '@chakra-ui/react';
import { system } from '../../lib/@chakra-ui/theme';
import { ColorModeProvider, type ColorModeProviderProps } from './color-mode';

export function ChakraProvider(props: ColorModeProviderProps) {
  return (
    <_ChakraProvider value={system}>
      <ColorModeProvider forcedTheme="dark" {...props} />
    </_ChakraProvider>
  );
}

'use client';
import { useBreakpointValue } from '@chakra-ui/react';

export function useIsHeaderMultiRow() {
  return useBreakpointValue({ base: true, md: false }, { fallback: 'md' });
}

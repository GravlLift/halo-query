'use client';
import { useToken } from '@chakra-ui/react';

export function useColors() {
  return useToken('colors', [
    'red.500',
    'blue.500',
    'yellow.500',
    'green.500',
    'cyan.500',
    'orange.500',
    'purple.500',
    'teal.500',
    'pink.500',
    'blue.300',
    'red.300',
    'yellow.300',
    'green.300',
    'cyan.300',
    'orange.300',
    'purple.300',
    'teal.300',
    'pink.300',
  ]);
}

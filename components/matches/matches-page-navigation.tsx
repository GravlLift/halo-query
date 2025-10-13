'use client';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Box, Button, Flex, Link } from '@chakra-ui/react';
import '@gravllift/utilities';
import NextLink from 'next/link';
import { Preset } from '../columns';
import { VerticalCenter } from '../vertical-center';
import { defaultPageSize } from './default-page-size';

export interface MatchesPageNavigationProps {
  contextGamertag: string[];
  page: number;
  filtersJSON: string | undefined;
  matchesCount: number;
  pageSize: number;
  columns: bigint | Preset | undefined;
}

export default function MatchesPageNavigation({
  contextGamertag,
  page,
  filtersJSON,
  matchesCount,
  pageSize,
  columns,
}: MatchesPageNavigationProps) {
  const currentSearchParams = new URLSearchParams({
    gamertag: contextGamertag.join(','),
  });
  if (columns != undefined && columns !== Preset.Default) {
    currentSearchParams.set('columns', columns.toString());
  }

  if (filtersJSON) {
    currentSearchParams.set('filters', filtersJSON);
  }

  if (pageSize !== defaultPageSize) {
    currentSearchParams.set('pageSize', pageSize.toString());
  }

  const nextSearchParams = new URLSearchParams(currentSearchParams);
  nextSearchParams.set('page', (page + 1).toString());

  const prevSearchParams = new URLSearchParams(currentSearchParams);
  prevSearchParams.set('page', (page - 1).toString());
  return (
    <Flex px="2">
      <Box width={200}>
        {contextGamertag.length && page > 1 ? (
          <Link asChild>
            <NextLink href={`/matches?${prevSearchParams}`} prefetch={false}>
              <Button type="button">
                <ChevronLeftIcon />
                Previous
              </Button>
            </NextLink>
          </Link>
        ) : null}
      </Box>
      <VerticalCenter flexGrow={1} textAlign="center">
        Page {page}
      </VerticalCenter>
      <Box textAlign={'right'} width={200}>
        {contextGamertag.length && matchesCount === pageSize ? (
          <Link asChild>
            <NextLink href={`/matches?${nextSearchParams}`} prefetch={false}>
              <Button type="button">
                Next
                <ChevronRightIcon />
              </Button>
            </NextLink>
          </Link>
        ) : null}
      </Box>
    </Flex>
  );
}

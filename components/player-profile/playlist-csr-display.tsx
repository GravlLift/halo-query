'use client';
import { Flex, HStack, Image, Spacer, Stat } from '@chakra-ui/react';
import { PlaylistCsr } from 'halo-infinite-api';
import { divisionImageSrc } from '@gravllift/halo-helpers';

export function PlaylistCsrDisplay({
  label,
  playlistCsr,
}: {
  label: string;
  playlistCsr: PlaylistCsr;
}) {
  return (
    <Stat.Root>
      <Stat.Label>{label}</Stat.Label>
      <HStack>
        <Image
          objectFit="contain"
          maxW={'25px'}
          src={divisionImageSrc(playlistCsr)}
          alt={`${playlistCsr.Tier} ${playlistCsr.SubTier + 1}`}
        />
        <Flex flexDir={'column'}>
          <Spacer />
          <Stat.ValueText>
            {playlistCsr.Value < 0 ? 'Unranked' : playlistCsr.Value}
          </Stat.ValueText>
          <Spacer />
        </Flex>
      </HStack>
      {playlistCsr.Tier && (
        <Stat.HelpText>
          {playlistCsr.Tier}
          {playlistCsr.Tier === 'Onyx' ? '' : ` ${playlistCsr.SubTier + 1}`}
        </Stat.HelpText>
      )}
    </Stat.Root>
  );
}

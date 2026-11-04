'use client';
import { Box, Heading, Text } from '@chakra-ui/react';
import { ProgressiveMatch } from '@gravllift/halo-helpers';
import { DateTime } from 'luxon';
import GameVariantCategoryDisplay from '../game-variant-category-display/game-variant-category-display';

export default function MatchHeader({
  matchId,
  match,
}: {
  matchId: string;
  match: ProgressiveMatch | undefined;
}) {
  return (
    <>
      <Text fontSize="lg" fontWeight="bold">
        {match ? (
          <>
            {'PublicName' in match.MatchInfo.UgcGameVariant ? (
              match.MatchInfo.UgcGameVariant.PublicName
            ) : (
              <>
                <GameVariantCategoryDisplay
                  gameVariantCategory={match.MatchInfo.GameVariantCategory}
                />{' '}
              </>
            )}
            {'PublicName' in match.MatchInfo.MapVariant
              ? ` on ${match.MatchInfo.MapVariant.PublicName}`
              : ''}
          </>
        ) : (
          matchId
        )}
      </Text>
      <Box flexGrow={1}>
        <Text fontSize="sm">
          {match &&
            DateTime.fromISO(match.MatchInfo.StartTime).toLocaleString(
              DateTime.DATETIME_SHORT,
            )}
        </Text>
      </Box>
    </>
  );
}

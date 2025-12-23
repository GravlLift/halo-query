import { Cache, abortSignalAny } from '@gravllift/utilities';
import { PlayerMatchHistory } from 'halo-infinite-api';
import { DateTime } from 'luxon';
import { nextRedirectRejectionHandler } from './promise-helpers';
import { JsonLogicTree } from '@react-awesome-query-builder/ui';
import { HaloCaches } from '@gravllift/halo-helpers';

export async function getMatchPage(
  xuid: string,
  matchId: string,
  pageSize: number,
  signal: AbortSignal,
  _filters: JsonLogicTree | undefined,
  haloCaches: HaloCaches
) {
  const { matchStatsCache, matchPageCache } = haloCaches;
  const match = await matchStatsCache.get(matchId);
  let low = 0;
  let high = 1;
  const matchStartDate = DateTime.fromISO(match.MatchInfo.EndTime);

  const matches = await Promise.allSettled([
    matchPageCache.get({ xuid, start: low * pageSize, pageSize }, signal),
    matchPageCache.get({ xuid, start: high * pageSize, pageSize }, signal),
  ]).then(nextRedirectRejectionHandler);
  const furthestFutureMatches = matches[0];
  let furthestPastMatches = matches[1];

  if (furthestFutureMatches.find((m) => m.MatchId === matchId)) {
    // If we happen to land on the right page, return it
    return low;
  } else if (furthestPastMatches.find((m) => m.MatchId === matchId)) {
    // If we happen to land on the right page, return it
    return high;
  }

  let rangeStartDate: DateTime = DateTime.fromISO(
    furthestPastMatches[furthestPastMatches.length - 1].MatchInfo.EndTime
  );
  while (rangeStartDate > matchStartDate) {
    low = high + 1;
    high = high * 2;

    furthestPastMatches = await matchPageCache.get({
      xuid,
      start: high * pageSize,
      pageSize,
    });

    if (furthestPastMatches.length < 25) {
      // Reached the beginning of history, gotta be somewhere in here...
      break;
    }

    if (furthestPastMatches.find((m) => m.MatchId === matchId)) {
      return high;
    }

    rangeStartDate = DateTime.fromISO(
      furthestPastMatches[furthestPastMatches.length - 1].MatchInfo.EndTime
    );
  }

  return await binarySearch(
    xuid,
    matchStartDate,
    matchPageCache,
    low,
    high,
    pageSize,
    new AbortController(),
    signal
  );
}

async function binarySearch(
  xuid: string,
  matchStartDate: DateTime,
  matchPageCache: Cache<
    PlayerMatchHistory[],
    { start: number; xuid: string; pageSize: number },
    []
  >,
  start: number,
  end: number,
  pageSize: number,
  abortController: AbortController,
  additionalSignal: AbortSignal
): Promise<number> {
  if (start === end) {
    abortController.abort('Search complete');
    throw new Error(`Match could not be positioned in user's history.`);
  }

  const mid = Math.floor((start + end) / 2);
  const midMatches = await matchPageCache.get(
    {
      xuid,
      start: mid * pageSize,
      pageSize,
    },
    abortSignalAny([additionalSignal, abortController.signal])
  );

  const midStartDate = DateTime.fromISO(
    midMatches[midMatches.length - 1].MatchInfo.EndTime
  );
  const midEndDate = DateTime.fromISO(midMatches[0].MatchInfo.EndTime);
  if (midStartDate <= matchStartDate && midEndDate >= matchStartDate) {
    // Found target, cancel any outstanding requests
    abortController.abort('Match page found');
    return mid;
  } else if (midStartDate > matchStartDate) {
    return await binarySearch(
      xuid,
      matchStartDate,
      matchPageCache,
      mid + 1,
      end,
      pageSize,
      abortController,
      additionalSignal
    );
  } else {
    return await binarySearch(
      xuid,
      matchStartDate,
      matchPageCache,
      start,
      mid,
      pageSize,
      abortController,
      additionalSignal
    );
  }
}

export async function getNextAndPreviousMatch(
  xuid: string,
  matchId: string,
  pageSize: number,
  signal: AbortSignal,
  filters: JsonLogicTree | undefined,
  haloCaches: HaloCaches
): Promise<{
  previous: PlayerMatchHistory | null;
  next: PlayerMatchHistory | null;
}> {
  const matchPageNumber = await getMatchPage(
    xuid,
    matchId,
    pageSize,
    signal,
    filters,
    haloCaches
  );

  const currentPage = await haloCaches.matchPageCache.get({
    xuid,
    start: matchPageNumber * pageSize,
    pageSize,
  });
  const matchIndex = currentPage.findIndex((m) => m.MatchId === matchId);
  // This part gets super confusing because "next" and "previous" mean
  // opposite things for the pages and individual matches.
  if (matchIndex === 0) {
    // Match is first on the page, so "next" match will be the last entry
    // on the previous page
    if (matchPageNumber === 0) {
      // This is the most recent match, so there is no previous page, and
      // thus no next match
      return { previous: currentPage[matchIndex + 1], next: null };
    } else {
      const previousPage = await haloCaches.matchPageCache.get({
        xuid,
        start: (matchPageNumber - 1) * pageSize,
        pageSize,
      });
      return {
        previous: currentPage[matchIndex + 1],
        next: previousPage[previousPage.length - 1],
      };
    }
  } else if (matchIndex === currentPage.length - 1) {
    // Match is last on the page, so "previous" match will be the first entry
    // on the next page
    if (currentPage.length < 25) {
      // This is the oldest match, so there is no next page, and no previous
      // match
      return { previous: null, next: currentPage[matchIndex - 1] };
    } else {
      const nextPage = await haloCaches.matchPageCache.get({
        xuid,
        start: (matchPageNumber + 1) * pageSize,
        pageSize,
      });

      return {
        next: currentPage[matchIndex - 1],
        previous: nextPage[0],
      };
    }
  } else {
    // Previous and next matches are both on the same page
    return {
      next: currentPage[matchIndex - 1],
      previous: currentPage[matchIndex + 1],
    };
  }
}

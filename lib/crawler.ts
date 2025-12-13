import { wrapXuid } from '@gravllift/halo-helpers';
import { DateTime } from 'luxon';
import { getPlayerMatches } from './match-query/player-matches';
import { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { HaloCaches } from '@gravllift/halo-helpers';

export async function crawlMatches(
  startingXuid: string,
  maxDepth: number,
  {
    signal,
    haloCaches,
    leaderboard,
  }: {
    leaderboard:
      | Pick<ILeaderboardProvider, 'addLeaderboardEntries' | 'getEntries'>
      | undefined;
    haloCaches: HaloCaches;
    signal: AbortSignal;
  },
  visitedMatches?: Set<string>,
  visitedXuids?: Set<string>,
  loggerFn?: (msg: string) => void
) {
  visitedXuids ??= new Set<string>();
  if (visitedXuids.has(startingXuid)) {
    return;
  } else {
    visitedXuids.add(startingXuid);
  }

  visitedMatches ??= new Set<string>();
  const xuidsToCrawl = new Set<string>();
  const { iterator, logger$ } = getPlayerMatches(
    leaderboard,
    [wrapXuid(startingXuid)],
    {
      limit: 1,
      filter: (m) =>
        m.MatchInfo.Playlist &&
        'PublicName' in m.MatchInfo.Playlist &&
        m.MatchInfo.Playlist.HasCsr,
      signal,
      loadUserData: false,
      dateRange: {
        start: DateTime.now().minus({ days: 7 }),
      },
    },
    haloCaches
  );

  let subscription: { unsubscribe: () => void } | undefined;
  if (loggerFn) {
    subscription = logger$.subscribe(loggerFn);
  } else {
    subscription = undefined;
  }

  try {
    for await (const match of iterator) {
      if (visitedMatches.has(match.MatchId)) {
        continue;
      }
      visitedMatches.add(match.MatchId);

      for (const player of match.MatchStats.Players) {
        if (player.xuid && !visitedXuids.has(player.xuid)) {
          xuidsToCrawl.add(player.xuid);
        }
      }
    }

    if (maxDepth > 0) {
      maxDepth--;
      if (maxDepth === 0) {
        return;
      }
    }

    for (const xuid of xuidsToCrawl) {
      await crawlMatches(
        xuid,
        maxDepth,
        {
          leaderboard,
          signal,
          haloCaches,
        },
        visitedMatches,
        visitedXuids,
        loggerFn
      );
    }
  } finally {
    subscription?.unsubscribe();
  }
}

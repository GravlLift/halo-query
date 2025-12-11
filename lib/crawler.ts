import { wrapXuid } from '@gravllift/halo-helpers';
import { DateTime } from 'luxon';
import { getPlayerMatches } from './match-query/player-matches';
import { ILeaderboardProvider } from '@gravllift/halo-helpers';
import { HaloCaches } from '@gravllift/halo-helpers';

export async function crawlMatches(
  leaderboard:
    | Pick<ILeaderboardProvider, 'addLeaderboardEntries' | 'getEntries'>
    | undefined,
  xuid: string,
  visitedMatches: Set<string>,
  maxDepth: number,
  signal: AbortSignal,
  haloCaches: HaloCaches,
  loggerFn?: (msg: string) => void
) {
  const xuidsToCrawl = new Set<string>();
  const { iterator, logger$ } = getPlayerMatches(
    leaderboard,
    [wrapXuid(xuid)],
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
        if (player.xuid) {
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
        leaderboard,
        xuid,
        visitedMatches,
        maxDepth,
        signal,
        haloCaches,
        loggerFn
      );
    }
  } finally {
    subscription?.unsubscribe();
  }
}

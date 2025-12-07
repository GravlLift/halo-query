'use client';
import {
  compareXuids,
  isRequestError,
  PlayerMatchHistoryStatsSkill,
} from '@gravllift/halo-helpers';
import { isAbortError } from '@gravllift/utilities';
import type { JsonLogicTree } from '@react-awesome-query-builder/ui';
import { apply, get_operator, get_values } from 'json-logic-js';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import { Observable } from 'rxjs';
import { appInsights } from '../../lib/application-insights/client';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { getPlayerMatches } from '../../lib/match-query/player-matches';
import { ColumnName, columns } from '../columns/base-columns';
import { useLeaderboard } from '../leaderboard-provider/leaderboard-context';
import { useNavigationController } from '../navigation-context';
import { toaster } from '../ui/toaster';

function filterUsesGamertags(jsonLogicTree: JsonLogicTree): boolean {
  // Traverse the object looking for gamertag references
  if (typeof jsonLogicTree === 'object') {
    for (const [key, val] of Object.entries(jsonLogicTree)) {
      if (
        key === 'var' &&
        ['Gamertag', 'Team Members', 'Enemy Team Members'].includes(val)
      ) {
        return true;
      } else if (filterUsesGamertags(val)) {
        return true;
      }
    }
  }
  return false;
}

function visibleColumnsUsesGamertags(
  visibleColumns: (typeof columns)[ColumnName][]
): boolean {
  for (const column of visibleColumns) {
    if (
      column === columns['Gamertag'] ||
      column === columns['Enemy Team Members'] ||
      column === columns['Team Members']
    ) {
      return true;
    }
  }
  return false;
}

function getQueryStartDate(
  logic: JsonLogicTree | undefined
): DateTime | undefined {
  if (!logic) {
    return undefined;
  }

  const operator = get_operator(logic);
  if (operator === 'and') {
    const values = get_values(logic);
    const startDates: DateTime[] = values
      .map((v: JsonLogicTree) => getQueryStartDate(v))
      .filter((date: DateTime | undefined) => date !== undefined);
    if (startDates.length > 0) {
      return DateTime.min(...startDates);
    } else {
      return undefined;
    }
  } else if (operator === 'or') {
    const values = get_values(logic);
    const startDates: DateTime[] = values.map((v: JsonLogicTree) =>
      getQueryStartDate(v)
    );
    if (startDates.length === 0 || startDates.some((d) => d === undefined)) {
      return undefined;
    } else {
      return DateTime.min(...startDates);
    }
  } else if (operator === '>=' || operator === '==' || operator === '===') {
    const values = get_values(logic);
    if (values[0]?.var === 'Start Time') {
      const date = DateTime.fromISO(values[1]);
      if (date.isValid) {
        return date;
      }
    }
  } else if (operator === '>') {
    const values = get_values(logic);
    if (values[0]?.var === 'Start Time') {
      const date = DateTime.fromISO(values[1]);
      if (date.isValid) {
        return date.plus({ milliseconds: 1 });
      }
    }
  }
}
function getQueryEndDate(
  jsonLogicTree: JsonLogicTree | undefined
): DateTime | undefined {
  if (!jsonLogicTree) {
    return undefined;
  }

  const operator = get_operator(jsonLogicTree);
  if (operator === 'and') {
    const values = get_values(jsonLogicTree);
    const endDates: DateTime[] = values
      .map((v: JsonLogicTree) => getQueryEndDate(v))
      .filter((date: DateTime | undefined) => date !== undefined);
    if (endDates.length > 0) {
      return DateTime.max(...endDates);
    } else {
      return undefined;
    }
  } else if (operator === 'or') {
    const values = get_values(jsonLogicTree);
    const endDates: DateTime[] = values.map((v: JsonLogicTree) =>
      getQueryEndDate(v)
    );
    if (endDates.length === 0 || endDates.some((d) => d === undefined)) {
      return undefined;
    } else {
      return DateTime.max(...endDates);
    }
  } else if (operator === '<=' || operator === '==' || operator === '===') {
    const values = get_values(jsonLogicTree);
    if (values[0]?.var === 'Start Time') {
      const date = DateTime.fromISO(values[1]);
      if (date.isValid) {
        return date;
      }
    }
  } else if (operator === '<') {
    const values = get_values(jsonLogicTree);
    if (values[0]?.var === 'Start Time') {
      const date = DateTime.fromISO(values[1]);
      if (date.isValid) {
        return date.minus({ milliseconds: 1 });
      }
    }
  }
}

export function useMatchesQuery(contextGamerTags: string[]) {
  const haloCaches = useHaloCaches();
  const { signal: navigationStartSignal } = useNavigationController();
  const [abortController, setAbortController] = useState<AbortController>();
  useEffect(() => {
    function onAbort(this: AbortSignal) {
      if (typeof this.reason !== 'object') {
        appInsights.trackEvent({
          name: 'UnexpectedAbortSignalReason',
          properties: {
            reason: this.reason,
          },
        });
        return;
      }

      const newUrl = new URL(this.reason.newUrl);
      if (newUrl.pathname !== '/matches') {
        abortController?.abort('Navigating away from matches page');
      }
    }
    navigationStartSignal.addEventListener('abort', onAbort);
    return () => {
      navigationStartSignal.removeEventListener('abort', onAbort);
    };
  }, [navigationStartSignal, abortController]);
  const leaderboard = useLeaderboard();

  const [loading, setLoading] = useState<boolean>(true);
  const [matches, setMatches] = useState<PlayerMatchHistoryStatsSkill[]>([]);
  const [logger$, setLogger$] = useState<Observable<string>>();
  const [queryPageSize, setQueryPageSize] = useState<number>();

  const runQuery = useCallback(
    async (
      page: number,
      pageSize: number,
      jsonLogicTree: JsonLogicTree | undefined,
      visibleColumns: (typeof columns)[ColumnName][]
    ) => {
      const user = await haloCaches.usersCache.get(contextGamerTags[0]);
      const _abortController = new AbortController();
      setAbortController(_abortController);
      setMatches([]);
      setQueryPageSize(pageSize);
      const { iterator, logger$ } = getPlayerMatches(
        leaderboard,
        contextGamerTags,
        {
          limit: pageSize,
          skip: (page - 1) * pageSize,
          filter: jsonLogicTree
            ? (m) => {
                try {
                  if (!jsonLogicTree) {
                    return true;
                  }
                  const player = m.MatchStats.Players.find((p) =>
                    compareXuids(p.xuid ?? '', user.xuid)
                  );
                  if (!player) {
                    return true;
                  }

                  const team = m.MatchStats.Teams.find(
                    (t) => t.TeamId === player.LastTeamId
                  );

                  const computedMatch = Object.fromEntries(
                    Object.entries(columns).map(([key, column]) => {
                      try {
                        return [
                          key,
                          ('queryValue' in column && column.queryValue
                            ? column.queryValue
                            : column.rawValue)({
                            match: m,
                            player,
                            team,
                          }),
                        ];
                      } catch (e) {
                        return [key, null];
                      }
                    })
                  );
                  return apply(jsonLogicTree, computedMatch);
                } catch (e) {
                  console.warn(e);
                  return false;
                }
              }
            : undefined,
          signal: _abortController.signal,
          loadUserData:
            (jsonLogicTree && filterUsesGamertags(jsonLogicTree)) ||
            visibleColumnsUsesGamertags(visibleColumns),
          dateRange: {
            start: getQueryStartDate(jsonLogicTree),
            end: getQueryEndDate(jsonLogicTree),
          },
        },
        haloCaches
      );
      setLogger$(logger$);
      setLoading(true);
      let error: Error | undefined = undefined;
      //appInsights.startTrackEvent('MatchesQuery');
      try {
        for await (const match of iterator) {
          setMatches((matches) => {
            if (!matches.some((m) => m.MatchId === match.MatchId)) {
              return [...matches, match];
            }
            return matches;
          });
        }
      } catch (e) {
        if (e instanceof Error) {
          if (isRequestError(e) && e.response.status === 404) {
            if (!toaster.isVisible('no-matches-found')) {
              toaster.create({
                id: 'no-matches-found',
                title: 'No matches found',
                description: `No matches were found for ${contextGamerTags[0]}`,
                type: 'error',
                duration: 5000,
              });
            }
            setMatches([]);
            return;
          } else if (isAbortError(e)) {
            return;
          }
          error = e;
        }
        throw e;
      } finally {
        setLoading(false);
        const properties: Record<string, string> = {
          gamertags: contextGamerTags.join(','),
          page: page.toString(),
          pageSize: pageSize.toString(),
          aborted: _abortController.signal.aborted.toString(),
        };
        if (jsonLogicTree) {
          properties.filter = JSON.stringify(jsonLogicTree);
        }
        if (error) {
          properties.error = error.message;
        }
        //appInsights.stopTrackEvent('MatchesQuery', properties);
      }
    },
    [leaderboard, contextGamerTags]
  );
  return {
    matches,
    loading,
    runQuery,
    queryPageSize,
    abortController,
    logger$,
  };
}

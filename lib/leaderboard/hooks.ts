import { useEffect, useMemo, useState } from 'react';
import {
  EMPTY,
  Observable,
  ObservableInput,
  ObservedValueOf,
  OperatorFunction,
  distinctUntilChanged,
  filter,
  finalize,
  from,
  startWith,
} from 'rxjs';
import { useLeaderboard } from '../../components/leaderboard-provider/leaderboard-context';
import { useObservable } from '../hooks/use-observable';
import { defaultBuckets } from './default-buckets';
import type { LeaderboardEntry } from '@gravllift/halo-helpers';

function bufferMap<T, O extends ObservableInput<unknown>>(
  project: (value: T, index: number) => O
): OperatorFunction<T, ObservedValueOf<O>> {
  return (source) =>
    new Observable((destination) => {
      const concurrent = 1;
      // Buffered values, in the event of going over our concurrency limit
      const buffer: [T] | T[] = [];
      // The number of active inner subscriptions.
      let active = 0;
      // An index to pass to our accumulator function
      let index = 0;
      // Whether or not the outer source has completed.
      let isComplete = false;

      /**
       * Checks to see if we can complete our result or not.
       */
      const checkComplete = () => {
        // If the outer has completed, and nothing is left in the buffer,
        // and we don't have any active inner subscriptions, then we can
        // Emit the state and complete.
        if (isComplete && !buffer.length && !active) {
          destination.complete();
        }
      };

      // If we're under our concurrency limit, just start the inner subscription, otherwise buffer and wait.
      const outerNext = (value: T) => {
        if (active < concurrent) {
          return doInnerSub(value);
        } else {
          buffer[0] = value;
        }
      };

      const doInnerSub = (value: T) => {
        // Increment the number of active subscriptions so we can track it
        // against our concurrency limit later.
        active++;

        // A flag used to show that the inner observable completed.
        // This is checked during finalization to see if we should
        // move to the next item in the buffer, if there is on.
        let innerComplete = false;

        // Start our inner subscription.
        from(project(value, index++))
          .pipe(
            finalize(() => {
              // During finalization, if the inner completed (it wasn't errored or
              // cancelled), then we want to try the next item in the buffer if
              // there is one.
              if (innerComplete) {
                // We have to wrap this in a try/catch because it happens during
                // finalization, possibly asynchronously, and we want to pass
                // any errors that happen (like in a projection function) to
                // the outer Subscriber.
                try {
                  // INNER SOURCE COMPLETE
                  // Decrement the active count to ensure that the next time
                  // we try to call `doInnerSub`, the number is accurate.
                  active--;
                  // If we have more values in the buffer, try to process those
                  // Note that this call will increment `active` ahead of the
                  // next conditional, if there were any more inner subscriptions
                  // to start.
                  while (buffer.length && active < concurrent) {
                    doInnerSub(buffer.shift()!);
                  }
                  // Check to see if we can complete, and complete if so.
                  checkComplete();
                } catch (err) {
                  destination.error(err);
                }
              }
            })
          )
          .subscribe({
            next: (innerValue) => {
              destination.next(innerValue);
            },
            complete: () => {
              // Flag that we have completed, so we know to check the buffer
              // during finalization.
              innerComplete = true;
            },
          });
      };

      source.subscribe({
        next: outerNext,
        complete: () => {
          // Outer completed, make a note of it, and check to see if we can complete everything.
          isComplete = true;
          checkComplete();
        },
      });
    });
}

export function useSkillBuckets(
  playlistAssetId: string,
  skillProp: 'csr' | 'esr'
): { buckets: Map<number, number>; loading: boolean } {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
  }, [playlistAssetId, skillProp]);

  const leaderboard = useLeaderboard();
  const observable$ = useMemo(
    () =>
      (leaderboard?.newEntries$ ?? EMPTY).pipe(
        filter((entries) =>
          entries.some((e) => e.playlistAssetId === playlistAssetId)
        ),
        startWith([] as LeaderboardEntry[]),
        bufferMap(() =>
          leaderboard!
            .getSkillBuckets(playlistAssetId, skillProp)
            .finally(() => setLoading(false))
        ),
        distinctUntilChanged(
          (a, b) =>
            (a == null && b != null) ||
            (a != null && b == null) ||
            (a != null &&
              b != null &&
              a.size === b.size &&
              [...a].every(([k, v]) => b.get(k) === v))
        )
      ),
    [leaderboard, playlistAssetId, skillProp]
  );
  return {
    buckets: useObservable(observable$, defaultBuckets),
    loading,
  };
}

export function useRankedEntries(
  playlistAssetId: string,
  options: {
    offset: number;
    limit: number;
  },
  skillProp: 'csr' | 'esr'
): {
  loading: boolean;
  value: (LeaderboardEntry & { rank: number })[] | undefined;
} {
  const leaderboard = useLeaderboard();
  const [loading, setLoading] = useState(true);
  const observable$ = useMemo(() => {
    setLoading(true);
    return (leaderboard?.newEntries$ ?? EMPTY).pipe(
      filter((entries) =>
        entries.some((e) => e.playlistAssetId === playlistAssetId)
      ),
      startWith([] as LeaderboardEntry[]),
      bufferMap(async () => {
        try {
          return await leaderboard!.getRankedEntries(
            playlistAssetId,
            {
              offset: options.offset,
              limit: options.limit,
            },
            skillProp
          );
        } finally {
          setLoading(false);
        }
      }),
      distinctUntilChanged(
        (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
      )
    );
  }, [leaderboard, playlistAssetId, skillProp, options.limit, options.offset]);
  return {
    loading,
    value: useObservable(observable$, undefined),
  };
}

export function usePlaylistEntriesCount(playlistAssetId: string) {
  const leaderboard = useLeaderboard();
  const observable$ = useMemo(
    () =>
      (leaderboard?.newEntries$ ?? EMPTY).pipe(
        filter((entries) =>
          entries.some((e) => e.playlistAssetId === playlistAssetId)
        ),
        startWith([] as LeaderboardEntry[]),
        bufferMap(() => leaderboard!.getPlaylistEntriesCount(playlistAssetId)),
        distinctUntilChanged()
      ),
    [leaderboard, playlistAssetId]
  );
  return useObservable(observable$, undefined);
}

export function usePlaylistAssetIds() {
  const leaderboard = useLeaderboard();
  const observable$ = useMemo(
    () =>
      (leaderboard?.newEntries$ ?? EMPTY).pipe(
        startWith([] as LeaderboardEntry[]),
        bufferMap(() =>
          leaderboard!.getPlaylistAssetIds().catch(() => [] as string[])
        ),
        distinctUntilChanged(
          (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
        )
      ),
    [leaderboard]
  );
  return useObservable(observable$, [] as string[]);
}

import {
  compareXuids,
  determineDiscoveryInfo,
  entryIsValid,
  LeaderboardEntry,
  LeaderboardEntryKeys,
  wrapXuid,
} from '@gravllift/halo-helpers';
import { handleType, retry } from 'cockatiel';
import Dexie from 'dexie';
import { appInsights } from '../../application-insights/client';
import { defaultBuckets } from '../default-buckets';
import {
  getLeaderboardTable,
  LeaderboardTable,
  transaction,
} from './indexed-db-repository';

const policy = retry(
  handleType(Dexie.DexieError)
    .orType(Dexie.BulkError)
    .orType(Dexie.ModifyError),
  {
    maxAttempts: 3,
  }
);

/** Adds entries to storage if they do not exist or are more recent than the current record */
export async function addLeaderboardEntries(
  entries: LeaderboardEntry[],
  fallbackDiscovererId: string
) {
  // Most recent match per user/playlist combo
  const validEntries = Array.from(
    entries
      .filter((entry) => entryIsValid(entry))
      .groupBy((s) => `${s.playlistAssetId}.${s.xuid}`)
  ).map(([, matches]) => matches.maxBy((m) => m.matchDate));
  if (!validEntries.length) return [];

  const entriesAdded: LeaderboardEntry[] = [];

  await policy.execute(async () =>
    transaction('rw', await getLeaderboardTable(), async (_, table) => {
      const [existingEntries, lastVersion] = await Promise.all([
        table.bulkGet(
          validEntries.map((entry) => [
            entry.playlistAssetId,
            wrapXuid(entry.xuid),
          ])
        ),
        table
          .where([
            LeaderboardEntryKeys.DiscoverySource,
            LeaderboardEntryKeys.DiscoveryVersion,
          ])
          .between(
            [fallbackDiscovererId, Dexie.minKey],
            [fallbackDiscovererId, Dexie.maxKey]
          )
          .lastKey()
          .then((lastKey) => (lastKey ? (lastKey as [string, number])[1] : 0)),
      ]);

      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i];
        const existingEntry = existingEntries[i];

        if (!existingEntry) {
          if (!entry[LeaderboardEntryKeys.DiscoverySource]) {
            entry[LeaderboardEntryKeys.DiscoverySource] = fallbackDiscovererId;
            entry[LeaderboardEntryKeys.DiscoveryVersion] = lastVersion + 1;
          }
          entriesAdded.push({
            ...entry,
            xuid: wrapXuid(entry.xuid),
          });
          continue;
        }

        if (existingEntry.matchDate < entry.matchDate) {
          if (!entry[LeaderboardEntryKeys.DiscoverySource]) {
            entry[LeaderboardEntryKeys.DiscoverySource] = fallbackDiscovererId;
            entry[LeaderboardEntryKeys.DiscoveryVersion] = lastVersion + 1;
          }
          entriesAdded.push({
            ...existingEntry,
            matchId: entry.matchId,
            gamertag: entry.gamertag,
            csr: entry.csr,
            matchDate: entry.matchDate,
            esr: entry.esr,
            gameVariantAssetId: entry.gameVariantAssetId,
            discoverySource: entry[LeaderboardEntryKeys.DiscoverySource],
            discoveryVersion: entry[LeaderboardEntryKeys.DiscoveryVersion],
          });
          continue;
        } else if (
          existingEntry.matchId === entry.matchId &&
          (existingEntry[LeaderboardEntryKeys.DiscoverySource] !==
            entry[LeaderboardEntryKeys.DiscoverySource] ||
            !entry[LeaderboardEntryKeys.DiscoverySource] ||
            !existingEntry[LeaderboardEntryKeys.DiscoverySource])
        ) {
          entriesAdded.push({
            ...existingEntry,
            ...determineDiscoveryInfo(existingEntry, entry, {
              discovererId: fallbackDiscovererId,
              lastVersion,
            }),
          });
          continue;
        }
      }

      if (entriesAdded.length) {
        await table.bulkPut(entriesAdded);
      }
    })
  );
  return entriesAdded;
}

export async function getRandomEntry() {
  const csrTable = await getLeaderboardTable();
  const totalEntries = await csrTable.count();
  return await policy.execute(() =>
    csrTable.offset(Math.floor(Math.random() * totalEntries)).first()
  );
}

export async function getGamertagIndex(
  xuid: string,
  playlistAssetId: string,
  skillProp: 'csr' | 'esr',
  signal?: AbortSignal
) {
  let index = 0;
  let done = false;
  await policy.execute(
    async ({ signal: innerSignal }) =>
      (
        await getLeaderboardTable()
      )
        .where([LeaderboardEntryKeys.PlaylistAssetId, skillProp])
        .between(
          [playlistAssetId, Dexie.minKey],
          [playlistAssetId, Dexie.maxKey]
        )
        .reverse()
        .until(() => done || innerSignal.aborted)
        .each((entry) => {
          if (compareXuids(entry.xuid, xuid)) {
            done = true;
            return;
          }
          index++;
        }),
    signal
  );
  signal?.throwIfAborted();
  if (!done) {
    return -1;
  }
  return index;
}

export function getAllEntries() {
  return policy.execute(async () => (await getLeaderboardTable()).toArray());
}

export async function getSkillBuckets(
  playlistAssetId: string,
  skillProp: 'csr' | 'esr'
) {
  const buckets = new Map<number, number>(defaultBuckets);
  await policy.execute(async () =>
    (
      await getLeaderboardTable()
    )
      .where([LeaderboardEntryKeys.PlaylistAssetId, skillProp])
      .between([playlistAssetId, Dexie.minKey], [playlistAssetId, Dexie.maxKey])
      .each((entry) => {
        const skill = entry[skillProp];
        const bucket = Math.floor(skill / 50) * 50;
        let bucketCount = buckets.get(bucket);
        if (bucketCount === undefined) {
          // If entry is above 1500, add buckets for the entry and all the ones in between
          for (let i = 1500; i < entry[skillProp]; i += 50) {
            if (!buckets.has(i)) {
              buckets.set(i, 0);
            }
          }
          // If entry is below 0, add buckets for the entry and all the ones in between
          for (let i = 0; i > entry[skillProp]; i -= 50) {
            if (!buckets.has(i)) {
              buckets.set(i, 0);
            }
          }

          bucketCount = 0;
        }

        buckets.set(bucket, bucketCount + 1);
      })
  );
  return buckets;
}

export function getRankedEntries(
  playlistAssetId: string,
  options: {
    offset: number;
    limit: number;
  },
  skillProp: 'csr' | 'esr'
) {
  return policy.execute(async () =>
    transaction('r', await getLeaderboardTable(), async (_, table) => {
      const result = await table
        .where([LeaderboardEntryKeys.PlaylistAssetId, skillProp])
        .between(
          [playlistAssetId, Dexie.minKey],
          [playlistAssetId, Dexie.maxKey]
        )
        .reverse()
        .offset(options.offset)
        .limit(options.limit)
        .toArray();

      if (result.length === 0) {
        return [];
      }

      const maxSkill = result[0][skillProp];
      const greaterCsrCount = await table
        .where([LeaderboardEntryKeys.PlaylistAssetId, skillProp])
        .between(
          [playlistAssetId, maxSkill],
          [playlistAssetId, Dexie.maxKey],
          false
        )
        .count();

      let rank = greaterCsrCount + 1;
      let lastSkill: number | undefined = maxSkill - 1;
      const value = result.map((entry, i) => {
        if (lastSkill !== entry[skillProp]) {
          lastSkill = entry[skillProp];
          rank = options.offset + i + 1;
        }
        return {
          ...entry,
          rank,
        };
      });
      return value;
    })
  );
}

export function getPlaylistEntriesCount(playlistAssetId: string) {
  return policy.execute(async () =>
    (await getLeaderboardTable())
      .where([LeaderboardEntryKeys.PlaylistAssetId, LeaderboardEntryKeys.Xuid])
      .between([playlistAssetId, Dexie.minKey], [playlistAssetId, Dexie.maxKey])
      .count()
      .then((count) => {
        appInsights.trackMetric({
          name: 'PlaylistEntriesCount',
          average: count,
          properties: {
            playlistAssetId,
          },
        });
        return count;
      })
  );
}

export function getPlaylistAssetIds() {
  return policy.execute(async () =>
    (await getLeaderboardTable())
      .orderBy(LeaderboardEntryKeys.PlaylistAssetId)
      .uniqueKeys()
      .then((keys) => keys as string[])
  );
}

export function getEntries(keys: string[]): Promise<
  {
    xuid: string;
    gamertag: string;
  }[]
> {
  return policy.execute(async () => {
    const leaderboardTable = await getLeaderboardTable();
    const seenXuids = new Set<string>();
    const distinctEntries: { xuid: string; gamertag: string }[] = [];
    await leaderboardTable.each((entry) => {
      if (keys.includes(entry.xuid) && !seenXuids.has(entry.xuid)) {
        seenXuids.add(entry.xuid);
        distinctEntries.push({ xuid: entry.xuid, gamertag: entry.gamertag });
      }
    });

    return distinctEntries;
  });
}

export async function getCurrentKnowledge() {
  return policy.execute(async () =>
    transaction('r', await getLeaderboardTable(), async (_, table) => {
      const knowledgeMap = new Map<string, number>();
      await table
        .orderBy([
          LeaderboardEntryKeys.DiscoverySource,
          LeaderboardEntryKeys.DiscoveryVersion,
        ])
        .reverse()
        .eachKey((key) => {
          const [source, version] = key as [string, number];
          if (!knowledgeMap.has(source)) {
            knowledgeMap.set(source, version);
          }
        });

      return knowledgeMap;
    })
  );
}

export async function getDeltaEntries(
  knowledges: Record<string, number | undefined>
) {
  const entries: LeaderboardEntry[] = [];
  return policy.execute(async () =>
    transaction('r', await getLeaderboardTable(), async (_, table) => {
      // Determine whether we can early-stop (only when we have a cutoff for every source)
      const allSources = (await table
        .orderBy(LeaderboardEntryKeys.DiscoverySource)
        .uniqueKeys()) as string[];
      const canEarlyStop = allSources.every((s) => knowledges[s] !== undefined);

      if (canEarlyStop) {
        const done = new Set<string>();
        await table
          .where([
            LeaderboardEntryKeys.DiscoverySource,
            LeaderboardEntryKeys.DiscoveryVersion,
          ])
          .between([Dexie.minKey, Dexie.minKey], [Dexie.maxKey, Dexie.maxKey])
          .reverse()
          .until(() => done.size === allSources.length)
          .each((entry) => {
            const source = entry[LeaderboardEntryKeys.DiscoverySource];
            const version = entry[LeaderboardEntryKeys.DiscoveryVersion];
            const cutoff = knowledges[source] as number; // defined due to canEarlyStop

            if (version >= cutoff) {
              entries.push(entry);
            } else if (!done.has(source)) {
              done.add(source);
            }
          });
      } else {
        // Fallback: single forward scan preserving original ordering
        await table
          .where([
            LeaderboardEntryKeys.DiscoverySource,
            LeaderboardEntryKeys.DiscoveryVersion,
          ])
          .between([Dexie.minKey, Dexie.minKey], [Dexie.maxKey, Dexie.maxKey])
          .each((entry) => {
            const source = entry[LeaderboardEntryKeys.DiscoverySource];
            const version = entry[LeaderboardEntryKeys.DiscoveryVersion];
            const cutoff = knowledges[source];
            if (cutoff === undefined || version >= cutoff) {
              entries.push(entry);
            }
          });
      }

      // Keep behaviorally consistent ordering: source ASC, version ASC
      entries.sort((a, b) => {
        const sa = a[
          LeaderboardEntryKeys.DiscoverySource
        ] as unknown as string as string;
        const sb = b[
          LeaderboardEntryKeys.DiscoverySource
        ] as unknown as string as string;
        const cmp = sa.localeCompare(sb);
        if (cmp !== 0) return cmp;
        const va = a[
          LeaderboardEntryKeys.DiscoveryVersion
        ] as unknown as number;
        const vb = b[
          LeaderboardEntryKeys.DiscoveryVersion
        ] as unknown as number;
        return va - vb;
      });

      return entries;
    })
  );
}

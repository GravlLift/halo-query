import { compareXuids, wrapXuid } from '@gravllift/halo-helpers';
import Dexie from 'dexie';
import { defaultBuckets } from '../default-buckets';
import { LeaderboardEntry, entryIsValid } from '@gravllift/halo-helpers';
import { getLeaderboardTable, transaction } from './indexed-db-repository';
import { appInsights } from '../../application-insights/client';

/** Adds entries to storage if they do not exist or are more recent than the current record */
export async function addLeaderboardEntries(entries: LeaderboardEntry[]) {
  // Most recent match per user/playlist combo
  const validEntries = Array.from(
    entries
      .filter((entry) => entryIsValid(entry))
      .groupBy((s) => `${s.playlistAssetId}.${s.xuid}`)
  ).map(([, matches]) => matches.maxBy((m) => m.matchDate));
  if (!validEntries.length) return [];

  const entriesAdded: LeaderboardEntry[] = [];
  await transaction('rw', await getLeaderboardTable(), async () => {
    const existingEntries = await (
      await getLeaderboardTable()
    ).bulkGet(
      validEntries.map((entry) => [entry.playlistAssetId, wrapXuid(entry.xuid)])
    );

    for (let i = 0; i < validEntries.length; i++) {
      const entry = validEntries[i];
      const existingEntry = existingEntries[i];

      if (!existingEntry) {
        entriesAdded.push({
          ...entry,
          xuid: wrapXuid(entry.xuid),
        });
      } else if (existingEntry.matchDate < entry.matchDate) {
        entriesAdded.push({
          ...existingEntry,
          matchId: entry.matchId,
          gamertag: entry.gamertag,
          csr: entry.csr,
          matchDate: entry.matchDate,
          esr: entry.esr,
          gameVariantAssetId: entry.gameVariantAssetId,
        });
      } else {
        // Entry exists and is more recent
        continue;
      }
    }

    if (entriesAdded.length) {
      await (await getLeaderboardTable()).bulkPut(entriesAdded);
    }
  }).catch((e) => {
    if (e instanceof Dexie.AbortError) {
      console.error('CSR Entry Add Transaction Aborted');
    } else if (e instanceof Dexie.TimeoutError) {
      console.error('CSR Entry Add Transaction Timed Out');
    } else if (e instanceof Dexie.DatabaseClosedError) {
      console.error('Database closed');
    } else if (e instanceof Dexie.BulkError) {
      if (
        e.failures.every(
          (f) =>
            f instanceof Dexie.AbortError ||
            f instanceof Dexie.TimeoutError ||
            f instanceof Dexie.DatabaseClosedError
        )
      ) {
        console.error('CSR Entry Add Transaction failed due to handled reason');
      } else {
        throw e;
      }
    }
  });
  return entriesAdded;
}

export async function getRandomEntry() {
  const csrTable = await getLeaderboardTable();
  const totalEntries = await csrTable.count();
  return await csrTable
    .offset(Math.floor(Math.random() * totalEntries))
    .first();
}

export async function getGamertagIndex(
  xuid: string,
  playlistAssetId: string,
  skillProp: 'csr' | 'esr',
  signal?: AbortSignal
) {
  let index = 0;
  let done = false;
  await (
    await getLeaderboardTable()
  )
    .where(['playlistAssetId', skillProp])
    .between([playlistAssetId, Dexie.minKey], [playlistAssetId, Dexie.maxKey])
    .reverse()
    .until(() => done || (signal != null && signal.aborted))
    .each((entry) => {
      if (compareXuids(entry.xuid, xuid)) {
        done = true;
        return;
      }
      index++;
    });
  signal?.throwIfAborted();
  if (!done) {
    return -1;
  }
  return index;
}

export async function getAllEntries() {
  return await (await getLeaderboardTable()).toArray();
}

export async function getSkillBuckets(
  playlistAssetId: string,
  skillProp: 'csr' | 'esr'
) {
  const buckets = new Map<number, number>(defaultBuckets);
  await (
    await getLeaderboardTable()
  )
    .where(['playlistAssetId', skillProp])
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
    });
  return buckets;
}

export async function getRankedEntries(
  playlistAssetId: string,
  options: {
    offset: number;
    limit: number;
  },
  skillProp: 'csr' | 'esr'
) {
  return transaction('r', await getLeaderboardTable(), async () => {
    const result = await (await getLeaderboardTable())
      .where(['playlistAssetId', skillProp])
      .between([playlistAssetId, Dexie.minKey], [playlistAssetId, Dexie.maxKey])
      .reverse()
      .offset(options.offset)
      .limit(options.limit)
      .toArray();

    if (result.length === 0) {
      return [];
    }

    const maxSkill = result[0][skillProp];
    const greaterCsrCount = await (await getLeaderboardTable())
      .where(['playlistAssetId', skillProp])
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
  });
}

export async function getPlaylistEntriesCount(playlistAssetId: string) {
  return await (
    await getLeaderboardTable()
  )
    .where(['playlistAssetId', 'xuid'])
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
    });
}

export async function getPlaylistAssetIds() {
  return (await getLeaderboardTable())
    .orderBy('playlistAssetId')
    .uniqueKeys()
    .then((keys) => keys as string[]);
}

export async function containsXuid(xuid: string): Promise<boolean> {
  return (await getLeaderboardTable())
    .where(['playlistAssetId', 'xuid'])
    .between([Dexie.minKey, wrapXuid(xuid)], [Dexie.maxKey, wrapXuid(xuid)])
    .count()
    .then((count) => count > 0);
}

export async function getEntries(keys: string[]): Promise<
  {
    xuid: string;
    gamertag: string;
  }[]
> {
  const leaderboardTable = await getLeaderboardTable();
  const entries = await leaderboardTable
    .filter((entry) => keys.includes(entry.xuid))
    .toArray();

  return entries.distinct((e1, e2) => compareXuids(e1.xuid, e2.xuid));
}

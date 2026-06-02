import {
  TableClient,
  TableEntity,
  TableEntityResult,
} from '@azure/data-tables';
import {
  compareXuids,
  entryIsValid,
  ILeaderboardProvider,
  LeaderboardEntry,
  LeaderboardEntryKeys,
  wrapXuid,
} from '@gravllift/halo-helpers';
import { handleAll, retry } from 'cockatiel';
import { defaultBuckets } from '../default-buckets';

type RawEntity = Record<string, unknown>;

const retryPolicy = retry(handleAll, {
  maxAttempts: 3,
});

const TABLE_NAME = process.env.HALO_QUERY_AZURE_TABLE_NAME ?? 'leaderboard';
const TABLE_CONNECTION_STRING =
  process.env.HALO_QUERY_AZURE_TABLES_CONNECTION_STRING ??
  process.env.AZURE_TABLES_CONNECTION_STRING;

let clientPromise: Promise<TableClient> | undefined;

function escapeFilterValue(value: string): string {
  return value.replaceAll("'", "''");
}

function readString(entity: RawEntity, key: string): string | null {
  const value = entity[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return null;
}

function readNumber(entity: RawEntity, key: string): number | null {
  const value = entity[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function toLeaderboardEntry(entity: RawEntity): LeaderboardEntry | null {
  const xuid = readString(entity, LeaderboardEntryKeys.Xuid);
  const playlistAssetId = readString(
    entity,
    LeaderboardEntryKeys.PlaylistAssetId,
  );
  const gameVariantAssetId = readString(
    entity,
    LeaderboardEntryKeys.GameVariantAssetId,
  );
  const gamertag = readString(entity, LeaderboardEntryKeys.Gamertag);
  const matchId = readString(entity, LeaderboardEntryKeys.MatchId);
  const matchDate = readNumber(entity, LeaderboardEntryKeys.MatchDate);
  const csr = readNumber(entity, LeaderboardEntryKeys.Csr);
  const esr = readNumber(entity, LeaderboardEntryKeys.Esr);

  if (
    xuid == null ||
    playlistAssetId == null ||
    gameVariantAssetId == null ||
    gamertag == null ||
    matchId == null ||
    matchDate == null ||
    csr == null ||
    esr == null
  ) {
    return null;
  }

  const entry: LeaderboardEntry = {
    xuid,
    playlistAssetId,
    gameVariantAssetId,
    gamertag,
    matchId,
    matchDate,
    csr,
    esr,
  };

  if (!entryIsValid(entry)) {
    return null;
  }

  return entry;
}

function toTableEntity(entry: LeaderboardEntry): TableEntity<RawEntity> {
  return {
    partitionKey: entry.playlistAssetId,
    rowKey: entry.xuid,
    ...entry,
    xuid: wrapXuid(entry.xuid),
  };
}

async function getClient() {
  if (!TABLE_CONNECTION_STRING) {
    throw new Error(
      'Azure tables connection string is missing. Set HALO_QUERY_AZURE_TABLES_CONNECTION_STRING or AZURE_TABLES_CONNECTION_STRING.',
    );
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      const client = TableClient.fromConnectionString(
        TABLE_CONNECTION_STRING,
        TABLE_NAME,
      );
      await client.createTable();
      return client;
    })();
  }

  return clientPromise;
}

async function getAllLeaderboardEntries(filter?: string, signal?: AbortSignal) {
  const client = await getClient();
  const entries: LeaderboardEntry[] = [];

  const finalFilter = filter
    ? `PartitionKey eq '${escapeFilterValue(LEADERBOARD_PARTITION_KEY)}' and ${filter}`
    : `PartitionKey eq '${escapeFilterValue(LEADERBOARD_PARTITION_KEY)}'`;

  const entities = client.listEntities<TableEntityResult<RawEntity>>({
    abortSignal: signal,
    queryOptions: {
      filter: finalFilter,
    },
  });

  for await (const entity of entities.byPage()) {
    for (const e of entity) {
      const mapped = toLeaderboardEntry(e);
      if (mapped) {
        entries.push(mapped);
      }
    }
  }

  return entries;
}

async function getExistingEntry(playlistAssetId: string, xuid: string) {
  const client = await getClient();
  const existing = await client
    .getEntity<
      TableEntityResult<RawEntity>
    >(LEADERBOARD_PARTITION_KEY, getEntryRowKey(playlistAssetId, xuid))
    .catch(() => undefined);

  if (!existing) {
    return undefined;
  }

  return toLeaderboardEntry(existing) ?? undefined;
}

export const provider: ILeaderboardProvider<LeaderboardEntry> = {
  initialized: async () => {
    if (!TABLE_CONNECTION_STRING) {
      return false;
    }
    await retryPolicy.execute(async () => {
      await getClient();
    });
    return true;
  },
  addLeaderboardEntries: async (entries) => {
    const newestByPlayerPlaylist = new Map<string, LeaderboardEntry>();
    for (const entry of entries) {
      if (!entryIsValid(entry)) {
        continue;
      }

      const key = `${entry.playlistAssetId}.${wrapXuid(entry.xuid)}`;
      const existing = newestByPlayerPlaylist.get(key);
      if (!existing || entry.matchDate > existing.matchDate) {
        newestByPlayerPlaylist.set(key, entry);
      }
    }

    const validEntries = [...newestByPlayerPlaylist.values()];
    if (validEntries.length === 0) {
      return [];
    }

    const entriesAdded: LeaderboardEntry[] = [];

    for (const entry of validEntries) {
      const existingEntry = await getExistingEntry(
        entry.playlistAssetId,
        entry.xuid,
      );

      if (!existingEntry) {
        entriesAdded.push({
          ...entry,
          xuid: wrapXuid(entry.xuid),
        });
        continue;
      }

      if (existingEntry.matchDate < entry.matchDate) {
        entriesAdded.push({
          ...existingEntry,
          matchId: entry.matchId,
          gamertag: entry.gamertag,
          csr: entry.csr,
          matchDate: entry.matchDate,
          esr: entry.esr,
          gameVariantAssetId: entry.gameVariantAssetId,
        });
        continue;
      }

      if (existingEntry.matchId === entry.matchId) {
        entriesAdded.push({
          ...existingEntry,
        });
      }
    }

    if (entriesAdded.length > 0) {
      const client = await getClient();
      for (const entry of entriesAdded) {
        await client.upsertEntity(toTableEntity(entry), 'Replace');
      }
    }

    return entriesAdded;
  },
  getAllEntries: async () => {
    return await retryPolicy.execute(
      async () => await getAllLeaderboardEntries(),
    );
  },
  getRandomEntry: async () => {
    const allEntries = await provider.getAllEntries();
    const totalEntries = allEntries.length;
    if (totalEntries === 0) {
      return undefined;
    }

    return allEntries[Math.floor(Math.random() * totalEntries)];
  },
  getGamertagIndex: async (xuid, playlistAssetId, skillProp, signal) => {
    const entries = await retryPolicy.execute(
      async () =>
        await getAllLeaderboardEntries(
          `${LeaderboardEntryKeys.PlaylistAssetId} eq '${escapeFilterValue(playlistAssetId)}'`,
          signal,
        ),
    );

    signal?.throwIfAborted();

    const sorted = [...entries].sort((a, b) => b[skillProp] - a[skillProp]);
    return sorted.findIndex((entry) => compareXuids(entry.xuid, xuid));
  },
  getSkillBuckets: async (playlistAssetId, skillProp) => {
    const entries = await retryPolicy.execute(
      async () =>
        await getAllLeaderboardEntries(
          `${LeaderboardEntryKeys.PlaylistAssetId} eq '${escapeFilterValue(playlistAssetId)}'`,
        ),
    );
    const buckets = new Map<number, number>(defaultBuckets);

    for (const entry of entries) {
      const skill = entry[skillProp];
      const bucket = Math.floor(skill / 50) * 50;

      let bucketCount = buckets.get(bucket);
      if (bucketCount === undefined) {
        for (let i = 1500; i < skill; i += 50) {
          if (!buckets.has(i)) {
            buckets.set(i, 0);
          }
        }
        for (let i = 0; i > skill; i -= 50) {
          if (!buckets.has(i)) {
            buckets.set(i, 0);
          }
        }
        bucketCount = 0;
      }

      buckets.set(bucket, bucketCount + 1);
    }

    return buckets;
  },
  getRankedEntries: async (playlistAssetId, options, skillProp) => {
    const entries = await retryPolicy.execute(
      async () =>
        await getAllLeaderboardEntries(
          `${LeaderboardEntryKeys.PlaylistAssetId} eq '${escapeFilterValue(playlistAssetId)}'`,
        ),
    );

    const sorted = [...entries].sort((a, b) => b[skillProp] - a[skillProp]);
    const ranked = sorted.map((entry, index, arr) => {
      let rank = index + 1;
      if (index > 0 && arr[index - 1][skillProp] === entry[skillProp]) {
        rank = 0;
        for (let i = index - 1; i >= 0; i--) {
          if (arr[i][skillProp] !== entry[skillProp]) {
            rank = i + 2;
            break;
          }
        }
        if (rank === 0) {
          rank = 1;
        }
      }

      return {
        ...entry,
        rank,
      };
    });

    return ranked.slice(options.offset, options.offset + options.limit);
  },
  getPlaylistEntriesCount: async (playlistAssetId) => {
    const entries = await retryPolicy.execute(
      async () =>
        await getAllLeaderboardEntries(
          `${LeaderboardEntryKeys.PlaylistAssetId} eq '${escapeFilterValue(playlistAssetId)}'`,
        ),
    );
    return entries.length;
  },
  getPlaylistAssetIds: async () => {
    const entries = await provider.getAllEntries();
    const ids = new Set<string>();
    for (const entry of entries) {
      ids.add(entry.playlistAssetId);
    }

    return [...ids].sort();
  },
  getEntries: async (xuids) => {
    const targetXuids = new Set<string>(xuids.map((xuid) => wrapXuid(xuid)));
    const allEntries = await provider.getAllEntries();
    const seenXuids = new Set<string>();
    const distinctEntries: { xuid: string; gamertag: string }[] = [];

    for (const entry of allEntries) {
      const wrappedXuid = wrapXuid(entry.xuid);
      if (targetXuids.has(wrappedXuid) && !seenXuids.has(wrappedXuid)) {
        seenXuids.add(wrappedXuid);
        distinctEntries.push({
          xuid: wrappedXuid,
          gamertag: entry.gamertag,
        });
      }
    }

    return distinctEntries;
  },
};

import {
  entryIsValid,
  ILeaderboardProvider,
  LeaderboardEntry,
} from '@gravllift/halo-helpers';
import { ResolvablePromise } from '@gravllift/utilities';
import { connect, Connection } from '@tursodatabase/serverless';

let initializedPromise: ResolvablePromise<Connection> | null = null;
async function initializeDatabase() {
  if (initializedPromise) {
    return initializedPromise;
  }

  initializedPromise = new ResolvablePromise();
  (async () => {
    try {
      const url = process.env.TURSO_URL;
      if (!url) {
        throw new Error('TURSO_URL environment variable is not set');
      }

      const conn = connect({
        url,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });

      initializedPromise.resolve(conn);
    } catch (error) {
      initializedPromise.reject(error);
    }
  })();
  return initializedPromise;
}

export const provider: ILeaderboardProvider<LeaderboardEntry> = {
  initialized: async function (): Promise<boolean> {
    return initializedPromise?.isCompleted || false;
  },
  addLeaderboardEntries: async function (
    entries: LeaderboardEntry[]
  ): Promise<LeaderboardEntry[]> {
    const validEntries = Array.from(
      entries
        .filter((entry) => entryIsValid(entry))
        .groupBy((s) => `${s.playlistAssetId}.${s.xuid}`)
    ).map(([, matches]) => matches.maxBy((m) => m.matchDate));
    if (!validEntries.length) return [];

    const conn = await initializeDatabase();
    // Insert entries only if they are more recent than existing entries (or if no existing entry)
    const insertPromises = validEntries.map((entry) =>
      conn.run(
        `
        INSERT INTO leaderboard (
          xuid, playlistAssetId, gameVariantAssetId, gamertag, matchId, matchDate, csr, esr
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(xuid, playlistAssetId) DO UPDATE SET
          gameVariantAssetId=excluded.gameVariantAssetId,
          gamertag=excluded.gamertag,
          matchId=excluded.matchId,
          matchDate=excluded.matchDate,
          csr=excluded.csr,
          esr=excluded.esr
        WHERE excluded.matchDate > leaderboard.matchDate
      `,
        [
          entry.xuid,
          entry.playlistAssetId,
          entry.gameVariantAssetId,
          entry.gamertag,
          entry.matchId,
          entry.matchDate,
          entry.csr,
          entry.esr,
        ]
      )
    );
    await Promise.all(insertPromises);
    return validEntries;
  },
  getAllEntries: function (): Promise<LeaderboardEntry[]> {
    throw new Error('Function not implemented.');
  },
  getRandomEntry: function (): Promise<LeaderboardEntry | undefined> {
    throw new Error('Function not implemented.');
  },
  getGamertagIndex: function (
    xuid: string,
    playlistAssetId: string,
    skillProp: 'csr' | 'esr',
    signal?: AbortSignal
  ): Promise<number> {
    throw new Error('Function not implemented.');
  },
  getSkillBuckets: async function (
    playlistAssetId: string,
    skillProp: 'csr' | 'esr'
  ): Promise<Map<number, number>> {
    const conn = await initializeDatabase();
    const buckets: { bucket: number; count: number }[] = await conn.all(
      `SELECT
          FLOOR(${skillProp} / 50) * 50 AS bucket,
          COUNT(*) AS count
      FROM leaderboard
      WHERE playlistAssetId = ?
      GROUP BY bucket
      ORDER BY bucket;`,
      [playlistAssetId]
    );

    // Fill buckets from min (or 0) to max (or 1500) with 0 counts if they don't exist
    const bucketMap = new Map<number, number>();
    const minBucket = Math.max(0, buckets.length ? buckets[0].bucket : 0);
    const maxBucket = Math.min(
      1500,
      buckets.length ? buckets[buckets.length - 1].bucket : 0
    );
    for (
      let bucket = Math.max(0, minBucket);
      bucket <= maxBucket;
      bucket += 50
    ) {
      bucketMap.set(bucket, 0);
    }
    buckets.forEach(({ bucket, count }) => {
      bucketMap.set(bucket, count);
    });
    return bucketMap;
  },
  getRankedEntries: function (
    playlistAssetId: string,
    options: { offset: number; limit: number },
    skillProp: 'csr' | 'esr'
  ): Promise<(LeaderboardEntry & { rank: number })[]> {
    throw new Error('Function not implemented.');
  },
  getPlaylistEntriesCount: async function (
    playlistAssetId: string
  ): Promise<number> {
    const conn = await initializeDatabase();
    const result = await conn.get(
      `SELECT COUNT(*) as count FROM leaderboard WHERE playlistAssetId = ?`,
      [playlistAssetId]
    );
    return result?.count || 0;
  },
  getPlaylistAssetIds: function (): Promise<string[]> {
    throw new Error('Function not implemented.');
  },
  getEntries: function (
    xuid: string[]
  ): Promise<{ xuid: string; gamertag: string }[]> {
    throw new Error('Function not implemented.');
  },
};

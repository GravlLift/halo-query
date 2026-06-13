import {
  entryIsValid,
  ILeaderboardProvider,
  LeaderboardEntry,
  SkillProp,
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
        `INSERT INTO leaderboard (
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
  getSkillBuckets: async function (
    playlistAssetId: string,
    skillProp: SkillProp
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
    const bucketMap = new Map<number, number>(
      buckets.map(({ bucket, count }) => [bucket, count])
    );
    return bucketMap;
  },
  getRankedEntries: async function (
    playlistAssetId: string,
    options: { offset: number; limit: number },
    skillProp: SkillProp
  ): Promise<(LeaderboardEntry & { rank: number })[]> {
    const conn = await initializeDatabase();

    const results = await conn.all(
      `SELECT
          xuid, playlistAssetId, gameVariantAssetId, gamertag, matchId, matchDate, csr, esr,
          RANK() OVER (ORDER BY ${skillProp} DESC) AS rank
      FROM leaderboard
      WHERE playlistAssetId = ?
      ORDER BY ${skillProp} DESC
      LIMIT ? OFFSET ?;`,
      [playlistAssetId, options.limit, options.offset]
    );
    return results;
  },
  getGamertagIndex: async function (
    gamertag: string,
    playlistAssetId: string,
    skillProp: SkillProp
  ): Promise<number> {
    const conn = await initializeDatabase();
    const result = await conn.get(
      `SELECT COUNT(*) + 1 AS "index" FROM leaderboard
        WHERE playlistAssetId = ? AND ${skillProp} > (
          SELECT ${skillProp} FROM leaderboard WHERE gamertag = ? AND playlistAssetId = ?
        );`,
      [playlistAssetId, gamertag, playlistAssetId]
    );
    return result?.index || -1;
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
  getPlaylistAssetIds: async function (): Promise<string[]> {
    const conn = await initializeDatabase();
    const results = await conn.all(
      `SELECT DISTINCT playlistAssetId FROM leaderboard`
    );
    return results.map((r) => r.playlistAssetId);
  },
};

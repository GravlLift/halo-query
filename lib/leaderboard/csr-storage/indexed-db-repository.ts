'use client';
import { LeaderboardEntry, entryIsValid } from '@gravllift/halo-helpers';
import Dexie, { Table, Transaction, TransactionMode } from 'dexie';

let _database: Promise<Dexie> | undefined;
async function getOrCreataDatabase() {
  if (!_database) {
    const db = new Dexie('Leaderboard');
    db.version(1).stores({
      csr: '[xuid+playlistAssetId],[playlistAssetId],xuid,csr',
    });
    db.version(2)
      .stores({
        csr: '[xuid+playlistAssetId],[playlistAssetId],xuid,csr,gamertag,matchDate',
      })
      .upgrade((trans) =>
        trans
          .table('csr')
          .toCollection()
          .modify((entry) => {
            delete entry.fetchedTime;
          })
      );
    db.version(3).stores({
      csr: '[playlistAssetId+xuid],[matchDate+playlistAssetId+gamertag],[playlistAssetId+csr]',
    });
    db.version(4).stores({
      leaderboard:
        '[playlistAssetId+xuid],[matchDate+playlistAssetId+gamertag],[playlistAssetId+csr],[playlistAssetId+esr]',
    });

    _database = db.open().catch(async (e) => {
      await db?.delete();
      throw e;
    });
  }
  return await _database;
}

let leaderboardTable:
  | Promise<Dexie.Table<LeaderboardEntry, [string, string]>>
  | undefined;
export let databaseInitialized = false;
export function getLeaderboardTable() {
  if (!leaderboardTable) {
    leaderboardTable = getOrCreataDatabase().then(async (db) => {
      const table = db.table<LeaderboardEntry, [string, string]>('leaderboard');
      console.debug('Ensuring leaderboard table is valid...');
      await table
        .toCollection()
        .modify(
          (entry: LeaderboardEntry, ref: { value?: LeaderboardEntry }) => {
            if (!entryIsValid(entry)) {
              delete ref.value;
            }
          }
        );
      console.debug('Ensured leaderboard table is valid');
      databaseInitialized = true;
      return table;
    });
  }
  return leaderboardTable;
}

export const transaction = <U>(
  mode: TransactionMode,
  table: Table,
  scope: (trans: Transaction) => PromiseLike<U> | U
) => getOrCreataDatabase().then((db) => db.transaction(mode, table, scope));

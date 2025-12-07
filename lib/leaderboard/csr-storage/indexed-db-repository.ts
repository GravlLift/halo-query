'use client';
import { LeaderboardEntry, entryIsValid } from '@gravllift/halo-helpers';
import Dexie, { Table, Transaction, TransactionMode } from 'dexie';

let _database: Dexie | null = null;
let _databaseOpenPromise: Promise<Dexie> | null = null;
async function getOrCreataDatabase() {
  if (!_database) {
    _database = new Dexie('Leaderboard');
    _database.version(1).stores({
      csr: '[xuid+playlistAssetId],[playlistAssetId],xuid,csr',
    });
    _database
      .version(2)
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
    _database.version(3).stores({
      csr: '[playlistAssetId+xuid],[matchDate+playlistAssetId+gamertag],[playlistAssetId+csr]',
    });
    _database.version(4).stores({
      leaderboard:
        '[playlistAssetId+xuid],[matchDate+playlistAssetId+gamertag],[playlistAssetId+csr],[playlistAssetId+esr]',
    });
  }

  if (!_databaseOpenPromise || _database.isOpen() === false) {
    _databaseOpenPromise = _database.open().catch(async (e) => {
      await _database?.delete();
      _database = null;
      throw e;
    });
  }

  await _databaseOpenPromise;
  return _database;
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

'use client';
import {
  LeaderboardEntry,
  entryIsValid,
  LeaderboardEntryKeys,
} from '@gravllift/halo-helpers';
import Dexie, { Table, Transaction, TransactionMode } from 'dexie';
import { appInsights } from '../../application-insights/client';

let _database: Dexie | null = null;
let _databaseOpenPromise: Promise<Dexie> | null = null;
async function getOrCreateDatabase() {
  if (!_database) {
    _database = new Dexie('Leaderboard');
    _database.version(1).stores({
      csr: `[${LeaderboardEntryKeys.Xuid}+${LeaderboardEntryKeys.PlaylistAssetId}],[${LeaderboardEntryKeys.PlaylistAssetId}],${LeaderboardEntryKeys.Xuid},${LeaderboardEntryKeys.Csr}`,
    });
    _database
      .version(2)
      .stores({
        csr: `[${LeaderboardEntryKeys.Xuid}+${LeaderboardEntryKeys.PlaylistAssetId}],[${LeaderboardEntryKeys.PlaylistAssetId}],${LeaderboardEntryKeys.Xuid},${LeaderboardEntryKeys.Csr},${LeaderboardEntryKeys.Gamertag},${LeaderboardEntryKeys.MatchDate}`,
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
      csr: `[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Xuid}],[${LeaderboardEntryKeys.MatchDate}+${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Gamertag}],[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Csr}]`,
    });
    _database.version(4).stores({
      leaderboard: `[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Xuid}],[${LeaderboardEntryKeys.MatchDate}+${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Gamertag}],[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Csr}],[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Esr}]`,
    });
    _database
      .version(5)
      .stores({
        leaderboard: `&[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Xuid}],[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Csr}],[${LeaderboardEntryKeys.PlaylistAssetId}+${LeaderboardEntryKeys.Esr}],[${LeaderboardEntryKeys.DiscoverySource}+${LeaderboardEntryKeys.DiscoveryVersion}],${LeaderboardEntryKeys.DiscoverySource}`,
      })
      .upgrade((trans) =>
        trans
          .table('leaderboard')
          .toCollection()
          .modify(async (entry) => {
            if (entry[LeaderboardEntryKeys.DiscoverySource] === undefined) {
              entry[LeaderboardEntryKeys.DiscoverySource] = '';
              entry[LeaderboardEntryKeys.DiscoveryVersion] = 0;
            }
          })
      );
    _database.version(6).stores({
      settings: 'key',
    });
  }

  if (!_databaseOpenPromise || _database.isOpen() === false) {
    _databaseOpenPromise = _database.open().catch(async (e) => {
      _database = null;
      throw e;
    });
  }

  await _databaseOpenPromise;
  return _database;
}

export function closeDatabase() {
  if (_database) {
    _database.close();
    _database = null;
    _databaseOpenPromise = null;
  }
}

export type LeaderboardTable = Dexie.Table<LeaderboardEntry, [string, string]>;
let leaderboardTable: Promise<LeaderboardTable> | undefined;
export let databaseInitialized = false;
export function getLeaderboardTable() {
  if (!leaderboardTable) {
    leaderboardTable = getOrCreateDatabase().then(async (db) => {
      const table = db.table<LeaderboardEntry, [string, string]>('leaderboard');
      table
        .toCollection()
        .modify(
          (entry: LeaderboardEntry, ref: { value?: LeaderboardEntry }) => {
            if (!entryIsValid(entry)) {
              delete ref.value;
            }
          }
        )
        .catch((err) => {
          if (err instanceof Error) {
            appInsights.trackException({ exception: err });
          } else {
            throw err;
          }
        });
      databaseInitialized = true;
      return table;
    });
  }
  return leaderboardTable;
}

export const transaction = <U, T, TKey, TInsertType>(
  mode: TransactionMode,
  table: Table<T, TKey, TInsertType>,
  scope: (
    trans: Transaction,
    table: Table<T, TKey, TInsertType>
  ) => PromiseLike<U> | U
) =>
  getOrCreateDatabase().then((db) =>
    db.transaction(mode, table, (trans) => scope(trans, table))
  );

export type Setting = { key: string; value: string };
export type SettingsTable = Dexie.Table<Setting, string>;
let settingsTable: Promise<SettingsTable> | undefined;
export function getSettingsTable() {
  if (!settingsTable) {
    settingsTable = getOrCreateDatabase().then((db) =>
      db.table<Setting, string>('settings')
    );
  }
  return settingsTable;
}

export async function getDiscovererId(): Promise<string> {
  const table = await getSettingsTable();
  const existing = await table.get('discovererId');
  if (existing && existing.value) {
    return existing.value;
  }
  const id = crypto.randomUUID();
  try {
    // Prefer add so concurrent callers don't overwrite each other.
    await table.add({ key: 'discovererId', value: id });
    return id;
  } catch (err) {
    // If another caller won the race, read the persisted value.
    const now = await table.get('discovererId');
    if (now && now.value) {
      return now.value;
    }
    // Fallback: return the generated id.
    return id;
  }
}

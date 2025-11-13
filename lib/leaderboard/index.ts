import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import {
  addLeaderboardEntries,
  getAllEntries,
  getGamertagIndex,
  getPlaylistAssetIds,
  getPlaylistEntriesCount,
  getRandomEntry,
  getRankedEntries,
  getSkillBuckets,
  containsXuid,
  getEntries,
} from './csr-storage';
import { databaseInitialized } from './csr-storage/indexed-db-repository';
export type { LeaderboardEntry } from '@gravllift/halo-helpers';

const provider: ILeaderboardProvider = {
  initialized: () => Promise.resolve(databaseInitialized),
  addLeaderboardEntries,
  getAllEntries,
  getRandomEntry,
  getGamertagIndex,
  getSkillBuckets,
  getRankedEntries,
  getPlaylistEntriesCount,
  getPlaylistAssetIds,
  containsXuid,
  getEntries,
};

export default provider;

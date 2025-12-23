import type { ILeaderboardProvider } from '@gravllift/halo-helpers';
import {
  addLeaderboardEntries,
  getAllEntries,
  getCurrentKnowledge,
  getDeltaEntries,
  getEntries,
  getGamertagIndex,
  getPlaylistAssetIds,
  getPlaylistEntriesCount,
  getRandomEntry,
  getRankedEntries,
  getSkillBuckets,
} from './csr-storage';
import {
  databaseInitialized,
  getDiscovererId,
} from './csr-storage/indexed-db-repository';
export type { LeaderboardEntry } from '@gravllift/halo-helpers';

const provider: ILeaderboardProvider = {
  initialized: () => Promise.resolve(databaseInitialized),
  addLeaderboardEntries: async (...args) =>
    await addLeaderboardEntries(...args, await getDiscovererId()),
  getAllEntries,
  getRandomEntry,
  getGamertagIndex,
  getSkillBuckets,
  getRankedEntries,
  getPlaylistEntriesCount,
  getPlaylistAssetIds,
  getEntries,
  getCurrentKnowledge,
  getDeltaEntries,
  getDiscovererId,
};

export default provider;

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
import { databaseInitialized } from './csr-storage/indexed-db-repository';
export type { LeaderboardEntry } from '@gravllift/halo-helpers';

async function getDiscovererId() {
  let discovererId = localStorage.getItem(
    'halo-query-leaderboard-csr-discoverer-id'
  );
  if (!discovererId) {
    discovererId = crypto.randomUUID();
    localStorage.setItem(
      'halo-query-leaderboard-csr-discoverer-id',
      discovererId
    );
  }
  return discovererId;
}

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

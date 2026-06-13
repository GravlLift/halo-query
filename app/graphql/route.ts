import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { IResolvers } from '@graphql-tools/utils';
import type { NextRequest } from 'next/server';
import { provider } from '../../lib/leaderboard/sqlite';
import typeDefs from './schema.graphql';

const resolvers: IResolvers = {
  Query: {
    leaderboardPlaylists: () => provider.getPlaylistAssetIds(),
    leaderboardPlaylistEntries: (
      _parent,
      {
        playlistId,
        page,
        skillProp,
      }: { playlistId: string; page: number; skillProp: 'csr' | 'esr' }
    ) =>
      provider.getRankedEntries(
        playlistId,
        { offset: (page - 1) * 100, limit: 100 },
        skillProp
      ),
    leaderboardPlaylistSkillBuckets: async (
      _parent,
      {
        playlistId,
        skillProp,
      }: { playlistId: string; skillProp: 'csr' | 'esr' }
    ) => {
      const map = await provider.getSkillBuckets(playlistId, skillProp);
      return Array.from(map.entries()).map(([skill, count]) => ({
        skill,
        count,
      }));
    },
    leaderboardPlaylistCount: (
      _parent,
      { playlistId }: { playlistId: string }
    ) => provider.getPlaylistEntriesCount(playlistId),
    leaderboardGamertagIndex: (
      _parent,
      {
        playlistId,
        xuid,
        skillProp,
      }: { playlistId: string; xuid: string; skillProp: 'csr' | 'esr' }
    ) => provider.getGamertagIndex(xuid, playlistId, skillProp),
  },
};

const handler = startServerAndCreateNextHandler<NextRequest>(
  new ApolloServer({ typeDefs, resolvers })
);

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}

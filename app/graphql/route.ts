import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { IResolvers } from '@graphql-tools/utils';
import type { NextRequest } from 'next/server';
import { provider } from '../../lib/leaderboard/sqlite';
import typeDefs from './schema.graphql';
import { SkillProp } from '@gravllift/halo-helpers';

const resolvers: IResolvers = {
  Query: {
    playlistIds: () => provider.getPlaylistAssetIds(),
    leaderboard: (
      _: unknown,
      {
        playlistId,
        skillProp,
      }: {
        playlistId: string;
        skillProp: SkillProp;
      }
    ) => ({
      playlistId,
      skillProp,
    }),
  },
  Leaderboard: {
    count: ({ playlistId }: { playlistId: string }) =>
      provider.getPlaylistEntriesCount(playlistId),
    entries: (
      { playlistId, skillProp }: { playlistId: string; skillProp: SkillProp },
      { page }: { page: number }
    ) =>
      provider.getRankedEntries(
        playlistId,
        { offset: (page - 1) * 100, limit: 100 },
        skillProp
      ),
    skillBuckets: async ({
      playlistId,
      skillProp,
    }: {
      playlistId: string;
      skillProp: SkillProp;
    }) => {
      const map = await provider.getSkillBuckets(playlistId, skillProp);
      return Array.from(map.entries()).map(([skill, count]) => ({
        skill,
        count,
      }));
    },
    gamertagIndex: (
      { playlistId, skillProp }: { playlistId: string; skillProp: SkillProp },
      { gamertag }: { gamertag: string }
    ) => provider.getGamertagIndex(gamertag, playlistId, skillProp),
  },
};

const handler = startServerAndCreateNextHandler<NextRequest>(
  new ApolloServer({ typeDefs, resolvers }),
  {}
);

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}

import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { IResolvers } from '@graphql-tools/utils';
import type { NextRequest } from 'next/server';
import typeDefs from './schema.graphql';

const entries = [
  {
    playlistId: 'playlist123',
    rank: 1,
    xuid: '1234567890',
    gamertag: 'PlayerOne',
    matchId: 'match123',
    matchDate: '2024-01-01T00:00:00Z',
    value: 2500.5,
  },
  {
    playlistId: 'playlist123',
    rank: 2,
    xuid: '0987654321',
    gamertag: 'PlayerTwo',
    matchId: 'match456',
    matchDate: '2024-01-02T00:00:00Z',
    value: 2400.0,
  },
];

const resolvers: IResolvers = {
  Query: {
    leaderboard: async (
      _parent,
      { playlistId, page }: { playlistId: string; page: number },
    ) => {
      // You can implement pagination logic here if needed
      return entries.filter((entry) => entry.playlistId === playlistId);
    },
  },
};

const handler = startServerAndCreateNextHandler<NextRequest>(
  new ApolloServer({ typeDefs, resolvers }),
);

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}

import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { IResolvers } from '@graphql-tools/utils';
import {
  isXuid,
  SkillProp,
  HaloCaches,
  getByXuid,
} from '@gravllift/halo-helpers';
import {
  HaloInfiniteClient,
  StaticXstsTicketTokenSpartanTokenProvider,
  XboxClient,
} from 'halo-infinite-api';
import type { NextRequest } from 'next/server';
import { provider } from '../../lib/leaderboard/sqlite';
import typeDefs from './schema.graphql';

let playlistIdsPromise: Promise<string[]> | null = null;
function getPlaylistIds() {
  playlistIdsPromise ??= provider.getPlaylistAssetIds();
  return playlistIdsPromise;
}

let haloInfiniteClient: HaloInfiniteClient | null = null;
function getHaloInfiniteClient(request: NextRequest) {
  haloInfiniteClient ??= new HaloInfiniteClient(
    new StaticXstsTicketTokenSpartanTokenProvider(
      request.headers.get('x-343-spartan-token')!
    )
  );
  return haloInfiniteClient;
}

let xboxClient: XboxClient | null = null;
function getXboxClient(request: NextRequest) {
  xboxClient ??= new XboxClient({
    getXboxLiveV3Token: async () => request.headers.get('authorization')!,
    clearXboxLiveV3Token: async () => {
      throw new Error('Clearing xbox live token is not supported');
    },
  });
  return xboxClient;
}

let haloCache: HaloCaches | null = null;
function getHaloCaches(request: NextRequest) {
  haloCache ??= new HaloCaches(
    getHaloInfiniteClient(request),
    getXboxClient(request),
    {
      xuidIsCurrentUser: async (xuid: string) => {
        // your implementation here
        return false;
      },
      additionalXuidFetcher: {
        fetchMapFn: getByXuid,
      },
    }
  );
  return haloCache;
}

const resolvers: IResolvers<any, NextRequest> = {
  Query: {
    playlistIds: () => getPlaylistIds(),
    leaderboard: async (
      _: unknown,
      {
        playlistId,
        skillProp,
      }: {
        playlistId: string;
        skillProp: SkillProp;
      }
    ) => {
      const playlistIds = await getPlaylistIds();
      if (!playlistIds.includes(playlistId)) {
        return null;
      }
      return {
        playlistId,
        skillProp,
      };
    },
    player: async (
      _,
      { xuidOrGamertag }: { xuidOrGamertag: string },
      context
    ) => {
      const haloCache = getHaloCaches(context);
      const user = await haloCache.usersCache.get(xuidOrGamertag);
      return user;
    },
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

const handler = startServerAndCreateNextHandler<NextRequest, NextRequest>(
  new ApolloServer<NextRequest>({ typeDefs, resolvers }),
  {
    context: async (request) => {
      return request;
    },
  }
);

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}

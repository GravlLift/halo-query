import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { IResolvers } from '@graphql-tools/utils';
import {
  compareXuids,
  getByXuid,
  HaloCaches,
  LeaderboardEntry,
  setMatchInfo,
  SkillProp,
  skillRankCombined,
} from '@gravllift/halo-helpers';
import { HaloInfiniteClient, MatchStats, XboxClient } from 'halo-infinite-api';
import { after, type NextRequest } from 'next/server';
import { provider } from '../../lib/leaderboard/sqlite';
import typeDefs from './schema.graphql';
import { DateTime } from 'luxon';

let playlistIdsPromise: Promise<string[]> | null = null;
function getPlaylistIds() {
  playlistIdsPromise ??= provider.getPlaylistAssetIds();
  return playlistIdsPromise;
}

let haloInfiniteClient: HaloInfiniteClient | null = null;
function getHaloInfiniteClient(request: NextRequest) {
  haloInfiniteClient = new HaloInfiniteClient({
    getSpartanToken: async () => request.headers.get('x-343-spartan-token')!,
    clearSpartanToken: async () => {
      throw new Error('Clearing spartan token is not supported');
    },
    getCurrentExpiration: async () => null,
  });
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
  const haloInfiniteClient = getHaloInfiniteClient(request);
  haloCache ??= new HaloCaches(haloInfiniteClient, getXboxClient(request), {
    xuidIsCurrentUser: async (xuid: string) => {
      const currentUser = await haloInfiniteClient.getCurrentUser();
      return currentUser && compareXuids(currentUser.xuid, xuid);
    },
    additionalXuidFetcher: {
      fetchMapFn: getByXuid,
    },
  });
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
    player: (_, { xuidOrGamertag }: { xuidOrGamertag: string }, context) => {
      const { usersCache } = getHaloCaches(context);
      return usersCache.get(xuidOrGamertag);
    },
    match: async (_, { matchId }: { matchId: string }, context) => {
      const { matchStatsCache } = getHaloCaches(context);
      const matchStats = await matchStatsCache.get(matchId);
      setMatchInfo(matchStats.MatchId, matchStats.MatchInfo);
      return matchStats;
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
  Match: {
    getSkills: async (
      {
        MatchId,
        MatchInfo: {
          EndTime: MatchDate,
          Playlist: playlistVersionLink,
          UgcGameVariant: { AssetId: GameVariantAssetId },
        },
      }: MatchStats,
      { playerXuids }: { playerXuids: string[] },
      context
    ) => {
      const { matchSkillsCache, xuidCache } = getHaloCaches(context);
      const xuidKeyObjectMap = new Map<
        string,
        { matchId: string; playerId: string }
      >();
      const skillMap = matchSkillsCache.get(
        playerXuids.map((xuid) => {
          const key = { matchId: MatchId, playerId: xuid };
          xuidKeyObjectMap.set(xuid, key);
          return key;
        })
      );

      if (playlistVersionLink?.AssetId) {
        after(async () => {
          const userInfoMap = xuidCache.get(playerXuids);
          const entries: LeaderboardEntry[] = [];
          const promises: Promise<void>[] = [];
          skillMap.forEach((skillPromise, key) => {
            promises.push(
              (async () => {
                const skill = await skillPromise;
                if (skill.ResultCode !== 0) {
                  return;
                }

                const userInfo = await userInfoMap.get(key.playerId);
                if (!userInfo?.gamertag) {
                  return;
                }
                const esr = skillRankCombined(skill.Result, 'Expected');
                if (esr == null) {
                  return;
                }

                entries.push({
                  xuid: key.playerId,
                  matchId: key.matchId,
                  matchDate: DateTime.fromISO(MatchDate).toMillis(),
                  playlistAssetId: playlistVersionLink.AssetId,
                  gameVariantAssetId: GameVariantAssetId,
                  gamertag: userInfo.gamertag,
                  csr: skill.Result.RankRecap.PostMatchCsr.Value,
                  esr,
                });
              })()
            );
          });
          await Promise.all(promises);
          if (entries.length > 0) {
            await provider.addLeaderboardEntries(entries);
          }
        });
      }

      return Promise.all(
        playerXuids.map((xuid) =>
          skillMap.get(xuidKeyObjectMap.get(xuid)!)?.then((skill) => {
            if (skill.ResultCode === 0) {
              return skill.Result;
            } else {
              return null;
            }
          })
        )
      );
    },
  },
};

const serverHandler = startServerAndCreateNextHandler<NextRequest, NextRequest>(
  new ApolloServer<NextRequest>({ typeDefs, resolvers }),
  {
    context: async (request) => request,
  }
);

const handler = async (request: NextRequest) => {
  return serverHandler(request);
};

export { handler as GET, handler as POST };

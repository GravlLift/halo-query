import {
  ApolloClient,
  defaultDataIdFromObject,
  gql,
  HttpLink,
  InMemoryCache,
  TypedDocumentNode,
} from '@apollo/client';
import {
  ObservableLeaderboardProvider,
  SkillProp,
} from '@gravllift/halo-helpers';
import { NEVER } from 'rxjs';

const GET_PLAYLIST_IDS: TypedDocumentNode<{
  playlistIds: string[];
}> = gql`
  query GetPlaylistIds {
    playlistIds
  }
`;

const GET_PLAYLIST_ENTRIES_COUNT: TypedDocumentNode<{
  leaderboard: {
    count: number;
  };
}> = gql`
  query GetPlaylistEntriesCount($playlistId: String!, $skillProp: SkillProp!) {
    leaderboard(playlistId: $playlistId, skillProp: $skillProp) {
      count
    }
  }
`;

const GET_SKILL_BUCKETS: TypedDocumentNode<{
  leaderboard: {
    skillBuckets: {
      count: number;
      skill: number;
    }[];
  };
}> = gql`
  query GetPlaylistEntriesCount($playlistId: String!, $skillProp: SkillProp!) {
    leaderboard(playlistId: $playlistId, skillProp: $skillProp) {
      skillBuckets {
        count
        skill
      }
    }
  }
`;

const GET_RANKED_ENTRIES: TypedDocumentNode<{
  leaderboard: {
    entries: {
      rank: number;
      xuid: string;
      gamertag: string;
      matchId: string;
      matchDate: number;
      csr: number;
      esr: number;
    }[];
  };
}> = gql`
  query GetPlaylistEntriesCount(
    $playlistId: String!
    $skillProp: SkillProp!
    $page: Int
  ) {
    leaderboard(playlistId: $playlistId, skillProp: $skillProp) {
      entries(page: $page) {
        rank
        xuid
        gamertag
        matchId
        matchDate
        csr
        esr
      }
    }
  }
`;

export function useLeaderboardProvider(): ObservableLeaderboardProvider {
  const client = new ApolloClient({
    link: new HttpLink({ uri: '/graphql' }),
    cache: new InMemoryCache({
      dataIdFromObject: (responseObject) => {
        return defaultDataIdFromObject(responseObject);
      },
    }),
  });
  return {
    getPlaylistAssetIds: async () => {
      const result = await client.query({
        query: GET_PLAYLIST_IDS,
      });
      return result.data?.playlistIds ?? [];
    },
    getPlaylistEntriesCount: async (playlistId: string) => {
      const result = await client.query({
        query: GET_PLAYLIST_ENTRIES_COUNT,
        variables: { playlistId, skillProp: SkillProp.Csr },
      });
      return result.data?.leaderboard?.count ?? 0;
    },
    getRankedEntries: async (
      playlistAssetId: string,
      options: {
        page: number;
      },
      skillProp: SkillProp
    ) => {
      const result = await client.query({
        query: GET_RANKED_ENTRIES,
        variables: {
          playlistId: playlistAssetId,
          skillProp,
          page: options.page,
        },
      });
      const entries = result.data?.leaderboard?.entries ?? [];
      return entries.map((e) => ({
        rank: e.rank,
        xuid: e.xuid,
        playlistAssetId,
        gameVariantAssetId: '',
        gamertag: e.gamertag,
        matchId: e.matchId,
        matchDate: e.matchDate,
        csr: e.csr,
        esr: e.esr,
      }));
    },
    getSkillBuckets: async (playlistAssetId: string, skillProp: SkillProp) => {
      const result = await client.query({
        query: GET_SKILL_BUCKETS,
        variables: { playlistId: playlistAssetId, skillProp },
      });
      const rawBuckets = result.data?.leaderboard.skillBuckets ?? [];
      const skillsWithData = rawBuckets.map(({ skill }) => skill);
      const bucketStart = Math.min(0, ...skillsWithData);
      const bucketEnd = Math.max(1500, ...skillsWithData);
      const skillMap = new Map<number, number>();
      for (let skill = bucketStart; skill <= bucketEnd; skill += 50) {
        const bucket = rawBuckets.find(({ skill: s }) => s === skill);
        skillMap.set(skill, bucket?.count ?? 0);
      }
      return skillMap;
    },
    initialized: async () => true,
    getGamertagIndex: async (
      xuid: string,
      playlistAssetId: string,
      skillProp: SkillProp,
      signal?: AbortSignal
    ) => {
      throw new Error('Not implemented');
    },
    newEntries$: NEVER,
  };
}

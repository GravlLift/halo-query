import { ApolloClient, HttpLink, InMemoryCache, gql } from '@apollo/client';
import {
  FetchFunction,
  HaloInfiniteClient,
  MatchSkill,
  ResultContainer,
  SpartanTokenProvider,
} from 'halo-infinite-api';

export class HybridHaloInfiniteClient extends HaloInfiniteClient {
  private apolloClient: ApolloClient;

  constructor(
    spartanTokenProvider: SpartanTokenProvider,
    fetchFn: FetchFunction = fetch
  ) {
    super(spartanTokenProvider, fetchFn);

    this.apolloClient = new ApolloClient({
      link: new HttpLink({ uri: '/graphql' }),
      cache: new InMemoryCache(),
    });
  }

  override async getMatchSkill(
    matchId: string,
    playerIds: string[],
    init?: Omit<RequestInit, 'body' | 'method'>
  ): Promise<ResultContainer<MatchSkill<0>>[]> {
    const result = await this.apolloClient.query({
      query: gql`
        query Match($matchId: String!, $playerIds: [String!]!) {
          match(matchId: $matchId) {
            MatchId
            getSkills(playerXuids: $playerIds) {
              TeamId
              TeamMmr
              StatPerformances {
                Kills {
                  Count
                  Expected
                  StdDev
                }
                Deaths {
                  Count
                  Expected
                  StdDev
                }
              }
              Counterfactuals {
                SelfCounterfactuals {
                  Kills
                  Deaths
                }
                TierCounterfactuals {
                  Bronze {
                    Kills
                    Deaths
                  }
                  Silver {
                    Kills
                    Deaths
                  }
                  Gold {
                    Kills
                    Deaths
                  }
                  Platinum {
                    Kills
                    Deaths
                  }
                  Diamond {
                    Kills
                    Deaths
                  }
                  Onyx {
                    Kills
                    Deaths
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        matchId,
        playerIds,
      },
    });

    throw new Error('Not implemented');
  }
}

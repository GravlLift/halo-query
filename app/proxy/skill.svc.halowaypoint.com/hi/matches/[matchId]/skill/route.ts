import {
  getByXuid,
  getMatchInfo,
  LeaderboardEntry,
  skillRankCombined,
} from '@gravllift/halo-helpers';
import { MatchSkill } from 'halo-infinite-api';
import { after, NextRequest } from 'next/server';
import { proxyFetch } from '../../../../../proxyRoute';
import { DateTime } from 'luxon';
import { provider } from '../../../../../../../lib/leaderboard/sqlite';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const params = await context.params;
  // Proxy request with fetch to the target URL
  const target = new URL(
    `https://skill.svc.halowaypoint.com/hi/matches/${params.matchId}/skill${request.nextUrl.search}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const cloneResponse = response.clone();
    after(async () => {
      const [body, matchInfo] = await Promise.all([
        cloneResponse.json() as Promise<{
          Value: { Id: string; ResultCode: 0 | 1; Result: MatchSkill }[];
        }>,
        getMatchInfo(params.matchId),
      ]);

      if (!matchInfo) {
        return;
      }

      const validResults = body.Value.filter(
        (
          result
        ): result is { Id: string; ResultCode: 0; Result: MatchSkill<0> } =>
          result.ResultCode === 0
      );
      const userInfoMap = getByXuid(validResults.map((result) => result.Id));

      const entries: LeaderboardEntry[] = [];
      for (const result of validResults) {
        const userInfo = await userInfoMap.get(result.Id);
        if (!userInfo?.gamertag) {
          continue;
        }

        const esr = skillRankCombined(result.Result, 'Expected');
        if (esr == null) {
          continue;
        }

        entries.push({
          xuid: result.Id,
          matchId: params.matchId,
          matchDate: DateTime.fromISO(matchInfo.MatchDate).toMillis(),
          playlistAssetId: matchInfo.PlaylistAssetId,
          gameVariantAssetId: matchInfo.GameVariantAssetId,
          gamertag: userInfo.gamertag,
          csr: result.Result.RankRecap.PostMatchCsr.Value,
          esr,
        });
      }

      if (entries.length > 0) {
        await provider.addLeaderboardEntries(entries);
      }
    });
  }
  return response;
}

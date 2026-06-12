import { MatchStats } from 'halo-infinite-api';
import { after, NextRequest } from 'next/server';
import { proxyFetch } from '../../../../../proxyRoute';
import { setMatchInfo } from '@gravllift/halo-helpers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const params = await context.params;
  // Proxy request with fetch to the target URL
  const target = new URL(
    `https://halostats.svc.halowaypoint.com/hi/matches/${params.matchId}/stats${request.nextUrl.search}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const cloneResponse = response.clone();
    after(async () => {
      const body: MatchStats = await cloneResponse.json();
      await setMatchInfo(body.MatchId, body.MatchInfo);
    });
  }
  return response;
}

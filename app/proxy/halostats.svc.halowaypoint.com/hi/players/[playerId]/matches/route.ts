import { setMatchInfo } from '@gravllift/halo-helpers';
import { PlayerMatchHistory } from 'halo-infinite-api';
import { after, NextRequest } from 'next/server';
import { proxyFetch } from '../../../../../proxyRoute';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ playerId: string }> }
) {
  const params = await context.params;
  // Proxy request with fetch to the target URL
  const target = new URL(
    `https://halostats.svc.halowaypoint.com/hi/players/${params.playerId}/matches${request.nextUrl.search}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const cloneResponse = response.clone();
    after(async () => {
      const body: { Results: PlayerMatchHistory[] } =
        await cloneResponse.json();
      await Promise.all(
        body.Results.map((match) =>
          setMatchInfo(match.MatchId, match.MatchInfo)
        )
      );
    });
  }
  return response;
}

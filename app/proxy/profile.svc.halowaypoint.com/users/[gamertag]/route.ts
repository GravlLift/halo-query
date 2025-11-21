import { after, NextRequest, NextResponse } from 'next/server';
import { addUserInfo, getByGamertag } from '../../../../../lib/user-cache';
import { proxyFetch } from '../../../proxyRoute';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ gamertag: string }> }
) {
  const params = await context.params;
  const userInfo = await getByGamertag([params.gamertag]).get(params.gamertag);
  if (userInfo) {
    return NextResponse.json(userInfo, {
      headers: {
        'Cache-Control': 's-maxage=120, stale-while-revalidate=600',
      },
    });
  }

  request.headers.set('Origin', 'https://www.halowaypoint.com');
  request.headers.delete('cookie');
  request.cookies.clear();

  // Proxy request with fetch to the target URL
  const target = new URL(
    `https://profile.svc.halowaypoint.com/users/${params.gamertag}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const dupeResponse = response.clone();
    after(async () => {
      const body = await dupeResponse.json();
      await addUserInfo(body);
    });

    response.headers.set(
      'Cache-Control',
      's-maxage=120, stale-while-revalidate=600'
    );
  }

  return response;
}

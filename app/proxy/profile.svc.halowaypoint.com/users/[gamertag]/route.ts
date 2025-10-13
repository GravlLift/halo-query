import { UserInfo } from 'halo-infinite-api';
import { NextRequest, NextResponse } from 'next/server';
import { addUserInfo, getByGamertag } from '../../../../../lib/user-cache';
import { proxyFetch } from '../../../proxyRoute';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ gamertag: string }> }
) {
  const params = await context.params;
  const userInfo = await getByGamertag([params.gamertag]).get(params.gamertag);
  if (userInfo) {
    return NextResponse.json(userInfo);
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
    await response
      .clone()
      .json()
      .then((body: UserInfo) => addUserInfo(body));
  }

  return response;
}

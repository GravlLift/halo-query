import { after, NextRequest, NextResponse } from 'next/server';
import { proxyFetch } from '../../proxyRoute';
import { addUserInfo, getByXuid } from '../../../../lib/user-cache';
import { UserInfo } from 'halo-infinite-api';
import { compareXuids } from '@gravllift/halo-helpers';
import type { HaloInfiniteClient } from 'halo-infinite-api';

export async function GET(request: NextRequest) {
  const xuidParam = request.nextUrl.searchParams.get('xuids');
  const xuids = xuidParam?.split(',') ?? [];

  const xuidsToFetch = new Set<string>();
  const userInfos = new Map<string, UserInfo>();
  if (xuids.length) {
    const userMap = getByXuid(xuids);
    for (const xuid of xuids) {
      const userInfo = await userMap.get(xuid);
      if (userInfo) {
        userInfos.set(xuid, userInfo);
      } else {
        xuidsToFetch.add(xuid);
      }
    }

    if (xuidsToFetch.size === 0) {
      return NextResponse.json(
        xuids.map((xuid) => userInfos.get(xuid)!),
        {
          headers: {
            'Cache-Control': 's-maxage=120, stale-while-revalidate=600',
          },
        }
      );
    }

    request.nextUrl.searchParams.set(
      'xuids',
      Array.from(xuidsToFetch).join(',')
    );
  } else {
    return NextResponse.json([]);
  }

  request.headers.set('Origin', 'https://www.halowaypoint.com');
  request.headers.delete('cookie');
  request.cookies.clear();

  const target = new URL(
    `https://profile.svc.halowaypoint.com/users?${request.nextUrl.searchParams}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const responseBody: Awaited<ReturnType<HaloInfiniteClient['getUsers']>> =
      await response.json();
    const newResponseBody: Awaited<ReturnType<HaloInfiniteClient['getUsers']>> =
      xuids.map((xuid) => {
        let userInfo: UserInfo;
        if (userInfos.has(xuid)) {
          userInfo = userInfos.get(xuid)!;
        } else {
          userInfo = responseBody.find((user) =>
            compareXuids(user.xuid, xuid)
          )!;
          after(() => addUserInfo(userInfo));
        }
        return userInfo;
      });
    // Update content length
    response.headers.set(
      'Content-Length',
      Buffer.byteLength(JSON.stringify(newResponseBody)).toString()
    );
    response.headers.set(
      'Cache-Control',
      's-maxage=120, stale-while-revalidate=600'
    );
    return NextResponse.json(newResponseBody, {
      status: response.status,
      headers: response.headers,
      statusText: response.statusText,
    });
  }

  return response;
}

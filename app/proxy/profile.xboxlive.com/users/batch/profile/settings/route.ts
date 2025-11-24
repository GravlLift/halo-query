import { compareXuids, getGamerpicUrl } from '@gravllift/halo-helpers';
import type { XboxClient } from 'halo-infinite-api';
import { UserInfo } from 'halo-infinite-api';
import { after, NextRequest, NextResponse } from 'next/server';
import { addUserInfo, getByXuid } from '../../../../../../../lib/user-cache';

type ResponseBody = Awaited<ReturnType<XboxClient['getProfiles']>>;
type ProfileUser = ResponseBody['profileUsers'][number];

function userInfoToProfileUser(userInfo: UserInfo): ProfileUser {
  return {
    id: userInfo.xuid,
    settings: [
      {
        id: 'Gamertag',
        value: userInfo.gamertag,
      },
      {
        id: 'GameDisplayPicRaw',
        value: userInfo.gamerpic.xlarge,
      },
    ],
  };
}

function profileUserToUserInfo(profileUser: ProfileUser): UserInfo {
  const gamerpicUrl = new URL(
    profileUser.settings.find((v) => v.id === 'GameDisplayPicRaw')?.value ?? ''
  );
  return {
    xuid: profileUser.id,
    gamertag:
      profileUser.settings.find((v) => v.id === 'Gamertag')?.value ?? '',
    gamerpic: {
      small: getGamerpicUrl(gamerpicUrl, 64),
      medium: getGamerpicUrl(gamerpicUrl, 208),
      large: getGamerpicUrl(gamerpicUrl, 424),
      xlarge: gamerpicUrl.toString(),
    },
  };
}

export async function POST(request: NextRequest) {
  const requestBody: { userIds: string[]; settings: string[] } = await request
    .clone()
    .json();
  const xuids = requestBody.userIds;

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
      return NextResponse.json({
        profileUsers: xuids.map((xuid) =>
          userInfoToProfileUser(userInfos.get(xuid)!)
        ),
      });
    }
  } else {
    return NextResponse.json({
      profileUsers: [],
    });
  }

  // Perform a partial fetch: only request missing xuids from upstream
  const url = new URL(
    'https://profile.xboxlive.com/users/batch/profile/settings'
  );
  const headers = new Headers(request.headers);
  headers.delete('origin');
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  const fetchBody = {
    userIds: Array.from(xuidsToFetch),
    settings: requestBody.settings,
  };

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(fetchBody),
  });

  // Re-wrap response and add CORS headers (mirrors proxyFetch behavior)
  response = new Response(response.body, response);
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '3600');

  if (response.ok) {
    const responseBody: Awaited<ReturnType<XboxClient['getProfiles']>> =
      await response.json();
    const newResponseBody: Awaited<ReturnType<XboxClient['getProfiles']>> = {
      profileUsers: [],
    };
    for (const xuid of xuids) {
      const userInfo = userInfos.get(xuid);
      if (userInfo) {
        newResponseBody.profileUsers.push(userInfoToProfileUser(userInfo));
      } else {
        const found = responseBody.profileUsers.find((user) =>
          compareXuids(user.id, xuid)
        );

        if (found) {
          newResponseBody.profileUsers.push(found);
          // Update the cache asynchronously
          after(() => addUserInfo(profileUserToUserInfo(found)));
        } else {
          console.warn(
            `Failed to find user profile for xuid(${xuid}) in both cache and upstream fetch.`
          );
        }
      }
    }

    // Update content length
    response.headers.set(
      'Content-Length',
      Buffer.byteLength(JSON.stringify(newResponseBody)).toString()
    );
    return NextResponse.json(newResponseBody, {
      status: response.status,
      headers: response.headers,
      statusText: response.statusText,
    });
  }

  return response;
}

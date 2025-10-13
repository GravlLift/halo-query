import { NextRequest, NextResponse } from 'next/server';
import { proxyFetch } from '../../../../../proxyRoute';
import { UserInfo } from 'halo-infinite-api';
import { addUserInfo, getByXuid } from '../../../../../../../lib/user-cache';
import { compareXuids, getGamerpicUrl } from '@gravllift/utilities';
import type { XboxClient } from 'halo-infinite-api';

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

    request.nextUrl.searchParams.set(
      'xuids',
      Array.from(xuidsToFetch).join(',')
    );
  } else {
    return NextResponse.json({
      profileUsers: [],
    });
  }

  const target = new URL(
    `https://profile.xboxlive.com/users/batch/profile/settings?${request.nextUrl.searchParams}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const responseBody: Awaited<ReturnType<XboxClient['getProfiles']>> =
      await response.json();
    const newResponseBody: Awaited<ReturnType<XboxClient['getProfiles']>> = {
      profileUsers: await Promise.all(
        xuids.map(async (xuid) => {
          let profileUser: ProfileUser;
          const userInfo = userInfos.get(xuid);
          if (userInfo) {
            profileUser = userInfoToProfileUser(userInfo);
          } else {
            profileUser = responseBody.profileUsers.find((user) =>
              compareXuids(user.id, xuid)
            )!;
            await addUserInfo(profileUserToUserInfo(profileUser));
          }
          return profileUser;
        })
      ),
    };
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

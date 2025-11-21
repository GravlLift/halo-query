import { UserInfo } from 'halo-infinite-api';
import { Redis } from '@upstash/redis';
import { wrapXuid } from '@gravllift/halo-helpers';
import { DateTime } from 'luxon';

const url =
  process.env['KV_REST_API_URL'] || process.env['UPSTASH_REDIS_REST_URL'];
const token =
  process.env['KV_REST_API_TOKEN'] || process.env['UPSTASH_REDIS_REST_TOKEN'];
let redis: Redis | undefined;
if (!url || !token) {
  redis = new Redis({
    url,
    token,
    keepAlive: false,
  });
} else {
  redis = undefined;
}

export function getByXuid(
  xuids: string[]
): Map<string, Promise<UserInfo | null>> {
  if (!redis) {
    return new Map(xuids.map((xuid) => [xuid, Promise.resolve(null)]));
  }

  const mGetPromise = redis.mget<UserInfo[]>(
    xuids.map((xuid) => wrapXuid(xuid))
  );
  return new Map(
    xuids.map((xuid) => [
      xuid,
      mGetPromise.then(
        (users) => users.find((user) => user?.xuid === xuid) ?? null
      ),
    ])
  );
}

export function getByGamertag(
  gamertags: string[]
): Map<string, Promise<UserInfo | null>> {
  if (!redis) {
    return new Map(
      gamertags.map((gamertag) => [gamertag, Promise.resolve(null)])
    );
  }

  return new Map(
    gamertags.map((gamertag) => {
      const key = /gt\([^)]+\)/.test(gamertag)
        ? gamertag.toLowerCase()
        : `gt(${gamertag.toLowerCase()})`;
      return [gamertag, redis.get(key)];
    })
  );
}

export async function addUserInfo(user: UserInfo): Promise<void> {
  if (!redis) {
    return;
  }

  const expireAt = DateTime.now().plus({
    days: +(process.env.USER_CACHE_EXPIRATION_DAYS || 7),
  });
  await Promise.all([
    redis.set(wrapXuid(user.xuid), user, {
      exat: Math.round(expireAt.toSeconds()),
    }),
    redis.set(`gt(${user.gamertag.toLowerCase()})`, user, {
      exat: Math.round(expireAt.toSeconds()),
    }),
  ]);
}

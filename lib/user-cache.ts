import { UserInfo } from 'halo-infinite-api';
import { Redis } from '@upstash/redis';
import { wrapXuid } from '@gravllift/halo-helpers';
import { DateTime } from 'luxon';

const REDIS_URL =
  process.env['KV_REST_API_URL'] ?? process.env['UPSTASH_REDIS_REST_URL'];
const REDIS_TOKEN =
  process.env['KV_REST_API_TOKEN'] ?? process.env['UPSTASH_REDIS_REST_TOKEN'];

if (!REDIS_URL || !REDIS_TOKEN) {
  // Intentionally throw on server to avoid silent use of missing credentials
  throw new Error(
    'Missing Redis credentials. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).'
  );
}

const redis = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
  keepAlive: false,
});

export function getByXuid(
  xuids: string[]
): Map<string, Promise<UserInfo | null>> {
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
  const expireAt = DateTime.now().plus({ days: 3 });
  await Promise.all([
    redis.set(wrapXuid(user.xuid), user, {
      exat: Math.round(expireAt.toSeconds()),
    }),
    redis.set(`gt(${user.gamertag.toLowerCase()})`, user, {
      exat: Math.round(expireAt.toSeconds()),
    }),
  ]);
}

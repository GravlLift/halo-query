import type { TokenPersister } from 'halo-infinite-api';
import { kv } from '@vercel/kv';

export const vercelKvTokenPersister: TokenPersister = {
  load: (tokenName: string) => kv.get(tokenName),
  save: async (tokenName, token) => {
    await kv.set(tokenName, token);
  },
  clear: async (tokenName) => {
    await kv.del(tokenName);
  },
};

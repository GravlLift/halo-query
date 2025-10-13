import type { TokenPersister } from 'halo-infinite-api';
import { nodeFsTokenPersister } from 'halo-infinite-api/token-persisters';
import { vercelKvTokenPersister } from './vercel-kv-token-persister';

export let tokenPersister: TokenPersister;

if (process.env['KV_REST_API_URL'] && process.env['KV_REST_API_TOKEN']) {
  tokenPersister = vercelKvTokenPersister;
} else {
  tokenPersister = nodeFsTokenPersister;
}

// Copies the map background images from @gravllift/halo-infinite-maps into public/.
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const source = path.join(
  path.dirname(require.resolve('@gravllift/halo-infinite-maps/package.json')),
  'images',
);
const target = path.join(process.cwd(), 'public', 'map-backgrounds');
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

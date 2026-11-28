// Copies map background images and the mediainfo.js wasm into public/.
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
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

const mediaInfoTarget = path.join(process.cwd(), 'public', 'mediainfo');
mkdirSync(mediaInfoTarget, { recursive: true });
copyFileSync(
  require.resolve('mediainfo.js/MediaInfoModule.wasm'),
  path.join(mediaInfoTarget, 'MediaInfoModule.wasm'),
);

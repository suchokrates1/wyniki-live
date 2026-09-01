import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUmpireAssetUrls } from '../src/umpire/offline/swAssets.js';

const root = fileURLToPath(new URL('../../wyniki/static/', import.meta.url));
const htmlPath = path.join(root, 'umpire.html');
const swPath = path.join(root, 'umpire-sw.js');

const html = await readFile(htmlPath, 'utf8');
const assets = extractUmpireAssetUrls(html);
const sw = await readFile(swPath, 'utf8');
const marker = 'const PRECACHE_ASSETS = [];';
if (!sw.includes(marker)) {
  throw new Error(`umpire-sw.js is missing ${marker}`);
}
const patched = sw.replace(marker, `const PRECACHE_ASSETS = ${JSON.stringify(assets)};`);
await writeFile(swPath, patched);
console.log(`umpire-sw precache: ${assets.length} hashed assets`);
for (const url of assets) console.log(`  ${url}`);

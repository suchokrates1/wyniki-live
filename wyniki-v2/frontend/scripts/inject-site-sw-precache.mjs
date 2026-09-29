import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../wyniki/static/', import.meta.url));
const htmlPath = path.join(root, 'index.html');
const swPath = path.join(root, 'site-sw.js');

function assetUrlsFromHtml(html) {
  const urls = [];
  for (const match of String(html || '').matchAll(/(?:src|href)=["'](\/?assets\/[^"']+)["']/g)) {
    const url = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

const html = await readFile(htmlPath, 'utf8');
const assets = assetUrlsFromHtml(html).filter((url) => {
  // Public shell only — skip admin/office/umpire hashed bundles if linked from shared chunks naming
  return true;
});
const sw = await readFile(swPath, 'utf8');
const marker = 'const PRECACHE_ASSETS = [];';
if (!sw.includes(marker)) {
  throw new Error(`site-sw.js is missing ${marker}`);
}
const patched = sw.replace(marker, `const PRECACHE_ASSETS = ${JSON.stringify(assets)};`);
await writeFile(swPath, patched);
console.log(`site-sw precache: ${assets.length} hashed assets`);
for (const url of assets) console.log(`  ${url}`);

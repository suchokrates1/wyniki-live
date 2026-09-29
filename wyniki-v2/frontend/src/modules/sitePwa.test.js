import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../public/', import.meta.url));

test('public PWA manifest points at site icons and standalone display', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/site.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'blindtennis.app');
  assert.equal(manifest.short_name, 'blindtennis');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.src.includes('site-icons/icon-192.png')));
  assert.ok(manifest.icons.some((icon) => icon.src.includes('site-icons/icon-512.png')));
});

test('public PWA shell files exist', () => {
  assert.equal(existsSync(`${root}site-sw.js`), true);
  assert.equal(existsSync(`${root}site.webmanifest`), true);
  assert.equal(existsSync(`${root}site-icons/icon-192.png`), true);
  assert.equal(existsSync(`${root}site-icons/icon-512.png`), true);
});

test('the two service workers do not fight over one scope', () => {
  // Both workers live in the site root, so the umpire one has to name a nested scope;
  // without it a single '/' registration holds only one of them and the pages evict
  // each other's worker on every visit.
  const umpireApp = readFileSync(new URL('../umpire/app.js', import.meta.url), 'utf8');
  assert.match(umpireApp, /register\('\/umpire-sw\.js',\s*\{\s*scope:\s*UMPIRE_SW_SCOPE\s*\}\)/);
  assert.match(umpireApp, /const UMPIRE_SW_SCOPE = '\/umpire'/);

  const mainJs = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(mainJs, /register\('\/site-sw\.js'\)/);

  const umpireManifest = JSON.parse(readFileSync(new URL('../../public/umpire.webmanifest', import.meta.url), 'utf8'));
  const siteManifest = JSON.parse(readFileSync(new URL('../../public/site.webmanifest', import.meta.url), 'utf8'));
  assert.equal(umpireManifest.scope, '/umpire');
  assert.equal(siteManifest.scope, '/');
});

test('each service worker only evicts its own caches', () => {
  // A worker that deletes every cache but its own takes the other PWA's offline
  // shell down with it, because both live on the same origin.
  for (const [file, prefix] of [['site-sw.js', 'site-pwa-'], ['umpire-sw.js', 'umpire-pwa-']]) {
    const source = readFileSync(new URL(`../../public/${file}`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`const CACHE_PREFIX = '${prefix}'`), `${file} must declare its cache prefix`);
    assert.match(source, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/, `${file} must scope its cache eviction`);
    assert.match(source, new RegExp(`const CACHE = '${prefix}`), `${file} cache name must use its own prefix`);
  }
});

test('index.html links the public manifest', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /theme-color/);
});

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

test('index.html links the public manifest', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /theme-color/);
});

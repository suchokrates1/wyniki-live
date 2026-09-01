import assert from 'node:assert/strict';
import test from 'node:test';
import { extractUmpireAssetUrls } from './swAssets.js';

test('extractUmpireAssetUrls collects hashed JS and CSS', () => {
  const html = `
    <script type="module" crossorigin src="/assets/umpire-a1b2c3.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/umpire-d4e5f6.css">
    <link rel="modulepreload" href="/assets/i18n-778899.js">
  `;
  assert.deepEqual(extractUmpireAssetUrls(html), [
    '/assets/umpire-a1b2c3.js',
    '/assets/umpire-d4e5f6.css',
    '/assets/i18n-778899.js',
  ]);
});

test('extractUmpireAssetUrls ignores fonts and empty html', () => {
  assert.deepEqual(extractUmpireAssetUrls('<link href="https://fonts.googleapis.com/css2">'), []);
  assert.deepEqual(extractUmpireAssetUrls(''), []);
});

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { UMPIRE_E2E_SCREEN_GATES } from './coverage.js';

const specDir = fileURLToPath(new URL('../../../e2e/umpire/', import.meta.url));

function specTitles() {
  return readdirSync(specDir)
    .filter((name) => name.endsWith('.spec.js'))
    .flatMap((name) => {
      const text = readFileSync(path.join(specDir, name), 'utf8');
      return [...text.matchAll(/test\('([^']+)'/g)].map((match) => match[1]);
    });
}

test('every umpire screen gate has a Playwright spec', () => {
  const titles = specTitles();
  assert.ok(titles.length > 0, 'no umpire Playwright specs found');
  for (const gate of UMPIRE_E2E_SCREEN_GATES) {
    const found = titles.some((title) => title === gate || title.startsWith(`${gate} `));
    assert.ok(found, `missing Playwright spec for screen ${gate}`);
  }
});

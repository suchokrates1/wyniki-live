import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('committed umpire PWA icons are valid PNGs', () => {
  for (const name of ['icon-192.png', 'icon-512.png']) {
    const file = fileURLToPath(new URL(`../../../public/umpire-icons/${name}`, import.meta.url));
    assert.equal(existsSync(file), true, name);
    const bytes = readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 8)], PNG, name);
    assert.ok(bytes.length > 200, `${name} too small`);
  }
});

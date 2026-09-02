import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], PNG);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('committed umpire PWA icons are the Android launcher at 192 and 512', () => {
  const expected = { 'icon-192.png': 192, 'icon-512.png': 512 };
  for (const [name, size] of Object.entries(expected)) {
    const file = fileURLToPath(new URL(`../../../public/umpire-icons/${name}`, import.meta.url));
    assert.equal(existsSync(file), true, name);
    const bytes = readFileSync(file);
    const { width, height } = pngSize(bytes);
    assert.equal(width, size, name);
    assert.equal(height, size, name);
    assert.ok(bytes.length > 20_000, `${name} too small for the Android artwork`);
  }
});

test('PWA manifest and HTML use Blind Tennis Referee', () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/umpire.webmanifest', import.meta.url)), 'utf8'));
  assert.equal(manifest.name, 'Blind Tennis Referee');
  assert.equal(manifest.short_name, 'Blind Tennis Referee');
  const html = readFileSync(fileURLToPath(new URL('../../../umpire.html', import.meta.url)), 'utf8');
  assert.match(html, /apple-mobile-web-app-title" content="Blind Tennis Referee"/);
});

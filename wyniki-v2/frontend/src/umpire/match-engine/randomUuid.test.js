import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { randomUUID } from './models.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('randomUUID works on an insecure page, where only getRandomValues exists', () => {
  const insecure = { getRandomValues: (array) => webcrypto.getRandomValues(array) };
  const first = randomUUID(insecure);
  assert.match(first, UUID_V4);
  assert.notEqual(randomUUID(insecure), first);
});

test('randomUUID uses the native one when the page is secure', () => {
  assert.equal(randomUUID({ randomUUID: () => 'native-id' }), 'native-id');
});

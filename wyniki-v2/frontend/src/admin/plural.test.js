import assert from 'node:assert/strict';
import test from 'node:test';

import { courtsHaveWord, courtsWord, peopleWord } from './plural.js';

test('Polish counts take the form the last digits ask for', () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 22, 25, 101, 102].map(courtsWord), [
    'kort', 'korty', 'korty', 'kortów',
    'kortów', 'kortów', 'kortów',
    'korty', 'kortów',
    'kortów', 'korty',
  ]);
  assert.equal(courtsWord(0), 'kortów');
  assert.deepEqual([1, 3, 5, 22].map(peopleWord), ['osoba', 'osoby', 'osób', 'osoby']);
  assert.deepEqual([1, 2, 5].map(courtsHaveWord), ['ma', 'mają', 'ma']);
});

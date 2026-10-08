import assert from 'node:assert/strict';
import test from 'node:test';
import { countedText, countedWord, countryName } from './plural.js';

const PL = { one: '{n} mecz', few: '{n} mecze', many: '{n} meczów', other: '{n} meczu' };
const LT = { one: '{n} mačas', few: '{n} mačai', many: '{n} mačo', other: '{n} mačų' };

test('a count takes the form its language asks for', () => {
  assert.deepEqual([1, 3, 5, 22, 12].map((n) => countedText('pl', PL, n)), ['1 mecz', '3 mecze', '5 meczów', '22 mecze', '12 meczów']);
  assert.deepEqual([1, 3, 10, 21].map((n) => countedText('lt', LT, n)), ['1 mačas', '3 mačai', '10 mačų', '21 mačas']);
  assert.equal(countedText('en', { one: '{n} match', other: '{n} matches' }, 1), '1 match');
  assert.equal(countedText('en', { other: '{n} matches' }, 1), '1 matches', 'a missing form falls back to other');
  assert.equal(countedWord('pl', PL, 3), 'mecze');
});

test('a country code reads as the country', () => {
  assert.equal(countryName('pl', 'PL'), 'Polska');
  assert.equal(countryName('en', 'de'), 'Germany');
  assert.equal(countryName('pl', ''), '');
  assert.equal(countryName('pl', 'XX1'), 'XX1');
});

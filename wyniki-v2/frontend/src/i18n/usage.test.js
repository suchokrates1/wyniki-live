import assert from 'node:assert/strict';
import test from 'node:test';

import { findUnusedKeys, isKeyUsed, leafKeys } from './usage.js';

test('the leaves of a dictionary are listed by their full path', () => {
  assert.deepEqual(leafKeys({ a: 'x', b: { c: 'y', d: { e: 'z' } } }), ['a', 'b.c', 'b.d.e']);
});

test('each of the ways the site reads a text counts as a use', () => {
  assert.ok(isKeyUsed('history.title', "t('history.title')"), 'full path');
  assert.ok(isKeyUsed('office.planning.step1Title', "this.ot('planning.step1Title')"), 'path the office helper prefixes');
  assert.ok(isKeyUsed('office.path.stateDone', 'this.ot(`path.state${step.state}`)'), 'path built in a template');
  assert.ok(isKeyUsed('bracket.legendWins', "description: b.legendWins || 'wygrane'"), 'property through an alias');
  assert.ok(isKeyUsed('schedule.statusDraft', "draft: 'statusDraft'"), 'name quoted on its own');
});

test('a key nothing can reach is reported', () => {
  const code = "t('history.title'); b.legendWins;";
  assert.deepEqual(
    findUnusedKeys({ history: { title: 'Historia', clearFilters: 'Wyczyść' }, bracket: { legendWins: 'W' } }, code),
    ['history.clearFilters'],
  );
});

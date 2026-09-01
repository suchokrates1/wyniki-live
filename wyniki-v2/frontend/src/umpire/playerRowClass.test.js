import assert from 'node:assert/strict';
import test from 'node:test';
import { playerRowClass } from './playerRowClass.js';

test('singles selection uses the default accent, not team colors', () => {
  assert.deepEqual(playerRowClass(false, -1), {});
  assert.deepEqual(playerRowClass(false, 0), { 'is-on': true });
});

test('doubles selection paints team1 then team2', () => {
  assert.deepEqual(playerRowClass(true, 0), { 'is-on': true, 'is-team1': true, 'is-team2': false });
  assert.deepEqual(playerRowClass(true, 1), { 'is-on': true, 'is-team1': true, 'is-team2': false });
  assert.deepEqual(playerRowClass(true, 2), { 'is-on': true, 'is-team1': false, 'is-team2': true });
  assert.deepEqual(playerRowClass(true, 3), { 'is-on': true, 'is-team1': false, 'is-team2': true });
});

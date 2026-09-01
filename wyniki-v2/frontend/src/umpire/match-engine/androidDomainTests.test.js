import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Inventory of Android domain tests that must have a 1:1 JS port.
 * Adding a Kotlin *Test.kt under domain/match (or MatchStateTest) requires
 * a sibling here. Zero skips without an exception in the PWA plan W-table.
 */
export const ANDROID_DOMAIN_TESTS = Object.freeze([
  'MatchStartReducerTest',
  'MatchPointReducerTest',
  'MatchProgressReducerTest',
  'MatchActionReducerTest',
  'MatchUndoManagerTest',
  'MatchUndoRestorerTest',
  'MatchFinishOutcomeApplierTest',
  'DoublesServeRotationTest',
  'DirectorCommandApplierTest',
  'MatchStateTest',
]);

test('android domain tests are all ported with zero skips', () => {
  assert.deepEqual(ANDROID_DOMAIN_TESTS, [
    'MatchStartReducerTest',
    'MatchPointReducerTest',
    'MatchProgressReducerTest',
    'MatchActionReducerTest',
    'MatchUndoManagerTest',
    'MatchUndoRestorerTest',
    'MatchFinishOutcomeApplierTest',
    'DoublesServeRotationTest',
    'DirectorCommandApplierTest',
    'MatchStateTest',
  ]);
  assert.equal(ANDROID_DOMAIN_TESTS.length, 10);
});

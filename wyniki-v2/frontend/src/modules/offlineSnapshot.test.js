import assert from 'node:assert/strict';
import test from 'node:test';

import { clearSnapshot, loadSnapshot, MAX_SNAPSHOT_AGE_MS, saveSnapshot } from './offlineSnapshot.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    _data: data,
  };
}

const SNAPSHOT = { courts: { 't1-1': { court_name: '1' } }, tournament_name: 'Test Cup' };

test('a saved snapshot comes back with the time it arrived', () => {
  const storage = memoryStorage();
  assert.equal(saveSnapshot(storage, SNAPSHOT, 1_000), true);

  const loaded = loadSnapshot(storage, 2_000);
  assert.deepEqual(loaded.courts, SNAPSHOT.courts);
  assert.equal(loaded.tournament_name, 'Test Cup');
  assert.equal(loaded.savedAt, 1_000);
});

test('an empty snapshot never replaces a good one', () => {
  const storage = memoryStorage();
  saveSnapshot(storage, SNAPSHOT, 1_000);

  assert.equal(saveSnapshot(storage, { courts: {} }, 2_000), false);
  assert.equal(saveSnapshot(storage, null, 2_000), false);
  assert.equal(loadSnapshot(storage, 2_000).savedAt, 1_000);
});

test('a snapshot past its age is not shown', () => {
  const storage = memoryStorage();
  saveSnapshot(storage, SNAPSHOT, 0);

  assert.ok(loadSnapshot(storage, MAX_SNAPSHOT_AGE_MS - 1));
  assert.equal(loadSnapshot(storage, MAX_SNAPSHOT_AGE_MS + 1), null);
});

test('unreadable or nonsense storage yields nothing rather than throwing', () => {
  assert.equal(loadSnapshot(null), null);
  assert.equal(loadSnapshot(memoryStorage()), null);
  assert.equal(loadSnapshot(memoryStorage({ 'wyniki.lastSnapshot': 'not json' })), null);
  assert.equal(loadSnapshot(memoryStorage({ 'wyniki.lastSnapshot': '{"courts":{}}' })), null);

  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(loadSnapshot(throwing), null);
  assert.equal(saveSnapshot(throwing, SNAPSHOT), false);
  assert.doesNotThrow(() => clearSnapshot(throwing));
});

test('a clock that jumped backwards does not surface a future snapshot', () => {
  const storage = memoryStorage();
  saveSnapshot(storage, SNAPSHOT, 10_000);
  assert.equal(loadSnapshot(storage, 5_000), null);
});

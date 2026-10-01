import assert from 'node:assert/strict';
import test from 'node:test';
import { courtsFromSnapshot } from './pwaShellView.js';

test('courts from the snapshot keep the number the public site shows', () => {
  const courts = courtsFromSnapshot({
    courts: {
      't32-3': { court_name: '3', display_order: 3 },
      't32-1': { court_name: '1', display_order: 1 },
      't32-2': { court_name: '2', display_order: 2 },
    },
  });
  assert.deepEqual(courts.map((court) => court.label), ['1', '2', '3']);
  assert.equal(courts[0].id, 't32-1');
});

test('a snapshot without courts is an empty picker', () => {
  assert.deepEqual(courtsFromSnapshot(null), []);
  assert.deepEqual(courtsFromSnapshot({ courts: [] }), []);
});

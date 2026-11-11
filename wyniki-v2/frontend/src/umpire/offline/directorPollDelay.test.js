import assert from 'node:assert/strict';
import test from 'node:test';
import { directorPollDelayMs } from './directorPollDelay.js';

test('a failed poll never repeats at once', () => {
  for (const status of [0, 400, 401, 403, 404, 429, 500, 502, 503]) {
    for (const failures of [1, 2, 5, 50]) {
      assert.ok(directorPollDelayMs(status, failures) >= 2000, `${status}/${failures}`);
    }
  }
});

test('server and network errors back off from 2 s to 30 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 60].map((n) => directorPollDelayMs(500, n)),
    [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(directorPollDelayMs(0, 1), 2000);
});

test('a missing court session waits for the PIN instead of hammering', () => {
  assert.equal(directorPollDelayMs(401, 1), 15000);
  assert.equal(directorPollDelayMs(403, 9), 15000);
});

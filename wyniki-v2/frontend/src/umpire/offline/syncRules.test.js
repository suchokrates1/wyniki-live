import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHttp, isRetryableStatus, shouldDropStale } from './syncRules.js';

test('403/404 drop stale outbox ids like the Vilnius finish fix', () => {
  assert.equal(classifyHttp(403), 'DROP');
  assert.equal(classifyHttp(404), 'DROP');
  assert.equal(shouldDropStale(403), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(classifyHttp(401), 'AUTH');
  assert.equal(classifyHttp(200), 'OK');
});

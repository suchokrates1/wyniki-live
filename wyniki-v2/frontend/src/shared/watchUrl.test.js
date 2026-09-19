import assert from 'node:assert/strict';
import test from 'node:test';
import { expandTournamentDays, sanitizeWatchUrl } from './watchUrl.js';

test('sanitizeWatchUrl keeps http(s) links and drops the rest', () => {
  assert.equal(sanitizeWatchUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(sanitizeWatchUrl('  http://example.test/live  '), 'http://example.test/live');
  assert.equal(sanitizeWatchUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeWatchUrl('https://user:pass@evil.test'), '');
  assert.equal(sanitizeWatchUrl('not-a-url'), '');
  assert.equal(sanitizeWatchUrl(''), '');
});

test('expandTournamentDays walks inclusive dates and caps the range', () => {
  assert.deepEqual(expandTournamentDays('2026-09-26', '2026-09-27'), [
    '2026-09-26',
    '2026-09-27',
  ]);
  assert.deepEqual(expandTournamentDays('2026-09-27', '2026-09-26'), [
    '2026-09-26',
    '2026-09-27',
  ]);
  assert.equal(expandTournamentDays('2026-01-01', '2026-12-31').length, 21);
  assert.deepEqual(expandTournamentDays('', '2026-09-26'), []);
});

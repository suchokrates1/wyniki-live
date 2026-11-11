import assert from 'node:assert/strict';
import test from 'node:test';
import { createUmpireApi } from './api.js';

const quiet = { getClientHeaders: () => ({}), getBattery: () => ({ level: null, charging: null }) };

test('a request the server never answers is given up after the timeout', async () => {
  const api = createUmpireApi({
    ...quiet,
    requestTimeoutMs: 20,
    fetchImpl: (_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  });
  await assert.rejects(api.updateMatch(1, {}), { name: 'AbortError' });
});

test('an answer in time is returned and the timeout option does not reach fetch', async () => {
  let seen = null;
  const api = createUmpireApi({
    ...quiet,
    requestTimeoutMs: 1000,
    fetchImpl: async (_path, options) => {
      seen = options;
      return { ok: true, status: 200, json: async () => ({ commands: [] }) };
    },
  });
  const result = await api.getDirectorCommands({ courtId: 't1-1', waitMs: 20_000 });
  assert.equal(result.ok, true);
  assert.equal('timeoutMs' in seen, false);
  assert.ok(seen.signal instanceof AbortSignal);
});

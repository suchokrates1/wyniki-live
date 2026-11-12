import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN_TOKEN_KEY, adminFetch, adminRequestCarriesSession } from './auth.js';

test('the administrator session rides on admin calls and on reading one match', () => {
  assert.equal(adminRequestCarriesSession('/admin/api/courts'), true);
  assert.equal(adminRequestCarriesSession('/admin/api/auth', 'POST'), false);
  assert.equal(adminRequestCarriesSession('/api/overlay/settings', 'PUT'), true);
  assert.equal(adminRequestCarriesSession('/api/overlay/settings', 'GET'), false);
  assert.equal(adminRequestCarriesSession('/api/overlay/stats/key'), true);
  assert.equal(adminRequestCarriesSession('/api/matches/42'), true);
  assert.equal(adminRequestCarriesSession('/api/matches/42', 'PUT'), false);
  assert.equal(adminRequestCarriesSession('/api/matches'), false);
  assert.equal(adminRequestCarriesSession('/api/snapshot'), false);
});

test('adminFetch attaches Bearer token and clears session on 401 without patching window.fetch', async () => {
  const prevFetch = globalThis.fetch;
  const prevStorage = globalThis.sessionStorage;
  const prevWindow = globalThis.window;

  const store = new Map([[ADMIN_TOKEN_KEY, 'secret-admin-jwt']]);
  const dispatched = [];
  globalThis.sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    removeItem: (k) => store.delete(k),
  };
  globalThis.window = {
    dispatchEvent: (ev) => dispatched.push(ev.type),
  };

  let capturedAuth = null;
  let statusToReturn = 200;
  globalThis.fetch = async (_input, init = {}) => {
    capturedAuth = new Headers(init.headers || {}).get('Authorization');
    return { status: statusToReturn, ok: statusToReturn < 400 };
  };

  try {
    await adminFetch('/admin/api/courts');
    assert.equal(capturedAuth, 'Bearer secret-admin-jwt');

    await adminFetch('/api/snapshot');
    assert.equal(capturedAuth, null);

    statusToReturn = 401;
    await adminFetch('/admin/api/courts');
    assert.equal(store.has(ADMIN_TOKEN_KEY), false);
    assert.deepEqual(dispatched, ['admin-session-expired']);
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.sessionStorage = prevStorage;
    globalThis.window = prevWindow;
  }
});

test('no production frontend source file monkey-patches window.fetch', () => {
  const srcRoot = fileURLToPath(new URL('../', import.meta.url));
  function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) out.push(full);
    }
    return out;
  }
  const offenders = walk(srcRoot).filter((file) => /\bwindow\.fetch\s*=/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

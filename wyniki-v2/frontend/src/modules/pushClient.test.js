import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchPushKey, isPushSupported, subscribe, unsubscribe, urlBase64ToUint8Array } from './pushClient.js';

test('a URL-safe base64 VAPID key decodes to the bytes PushManager wants', () => {
  // "hello" as standard base64 is aGVsbG8=, which needs padding restored.
  assert.deepEqual(Array.from(urlBase64ToUint8Array('aGVsbG8')), [104, 101, 108, 108, 111]);
  // The '-' and '_' of the URL-safe alphabet map back to '+' and '/'.
  assert.deepEqual(Array.from(urlBase64ToUint8Array('-_8')), [251, 255]);
});

test('push support needs all three browser pieces', () => {
  const full = { PushManager: {}, Notification: {}, navigator: { serviceWorker: {} } };
  assert.equal(isPushSupported(full), true);
  assert.equal(isPushSupported({ ...full, PushManager: undefined }), false);
  assert.equal(isPushSupported({ ...full, Notification: undefined }), false);
  assert.equal(isPushSupported({ ...full, navigator: {} }), false);
  assert.equal(isPushSupported(undefined), false);
});

test('an unreachable or unhappy key endpoint reads as "push is off"', async () => {
  assert.deepEqual(await fetchPushKey(() => Promise.reject(new Error('offline'))), { enabled: false, public_key: '' });
  assert.deepEqual(await fetchPushKey(() => Promise.resolve({ ok: false })), { enabled: false, public_key: '' });
  assert.deepEqual(
    await fetchPushKey(() => Promise.resolve({ ok: true, json: async () => ({ enabled: true, public_key: 'abc' }) })),
    { enabled: true, public_key: 'abc' },
  );
});

function fakeRegistration(existing = null) {
  const created = [];
  return {
    created,
    pushManager: {
      getSubscription: async () => existing,
      subscribe: async (options) => {
        created.push(options);
        return { toJSON: () => ({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } }) };
      },
    },
  };
}

test('a refused permission stops before anything is sent', async (t) => {
  const original = globalThis.Notification;
  t.after(() => { globalThis.Notification = original; });
  globalThis.Notification = { requestPermission: async () => 'denied' };

  let called = false;
  const result = await subscribe({
    registration: fakeRegistration(),
    publicKey: 'aGVsbG8',
    fetchImpl: () => { called = true; },
  });

  assert.deepEqual(result, { ok: false, reason: 'denied' });
  assert.equal(called, false, 'nothing reaches the server without permission');
});

test('subscribing asks for a visible notification and posts the subscription', async (t) => {
  const original = globalThis.Notification;
  t.after(() => { globalThis.Notification = original; });
  globalThis.Notification = { requestPermission: async () => 'granted' };

  const registration = fakeRegistration();
  const posts = [];
  const result = await subscribe({
    registration,
    publicKey: 'aGVsbG8',
    courtId: 't32-1',
    lang: 'lt',
    fetchImpl: async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
  });

  assert.equal(result.ok, true);
  assert.equal(registration.created[0].userVisibleOnly, true);
  assert.equal(posts[0].url, '/api/push/subscribe');
  assert.equal(posts[0].body.court_id, 't32-1');
  assert.equal(posts[0].body.lang, 'lt');
  assert.equal(posts[0].body.endpoint, 'https://push.example/new');
});

test('an existing subscription is reused rather than replaced', async (t) => {
  const original = globalThis.Notification;
  t.after(() => { globalThis.Notification = original; });
  globalThis.Notification = { requestPermission: async () => 'granted' };

  const existing = { toJSON: () => ({ endpoint: 'https://push.example/old', keys: { p256dh: 'p', auth: 'a' } }) };
  const registration = fakeRegistration(existing);
  const posts = [];
  await subscribe({
    registration,
    publicKey: 'aGVsbG8',
    fetchImpl: async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true }; },
  });

  assert.equal(registration.created.length, 0, 'no second subscription is created');
  assert.equal(posts[0].endpoint, 'https://push.example/old');
});

test('unsubscribing still succeeds when the server call fails', async () => {
  let unsubscribed = false;
  const registration = {
    pushManager: {
      getSubscription: async () => ({
        endpoint: 'https://push.example/x',
        unsubscribe: async () => { unsubscribed = true; return true; },
      }),
    },
  };

  const result = await unsubscribe({ registration, fetchImpl: () => Promise.reject(new Error('offline')) });
  assert.deepEqual(result, { ok: true });
  assert.equal(unsubscribed, true);
});

test('unsubscribing with nothing subscribed is a no-op', async () => {
  const registration = { pushManager: { getSubscription: async () => null } };
  let called = false;
  assert.deepEqual(await unsubscribe({ registration, fetchImpl: () => { called = true; } }), { ok: true });
  assert.equal(called, false);
});

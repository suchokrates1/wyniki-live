import assert from 'node:assert/strict';
import test from 'node:test';

import { isIosSafari, shouldShowIosInstallHint } from './iosInstallHint.js';
import { applyUpdate, reloadOnControllerChange, SKIP_WAITING, watchForUpdate } from './swUpdate.js';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36';
const IPADOS_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

test('the install hint is for iOS Safari only', () => {
  assert.equal(isIosSafari(IPHONE_SAFARI), true);
  // iPadOS reports a Mac user agent, so touch points are the only tell.
  assert.equal(isIosSafari(IPADOS_SAFARI, 5), true);
  assert.equal(isIosSafari(IPADOS_SAFARI, 0), false);
  // Chrome on iOS cannot install at all, so a Share-sheet hint would be wrong.
  assert.equal(isIosSafari(IPHONE_CHROME), false);
  // Android gets a real install prompt from the browser.
  assert.equal(isIosSafari(ANDROID_CHROME), false);
});

test('the hint stays away once installed or waved away', () => {
  const base = { userAgent: IPHONE_SAFARI, storage: memoryStorage() };
  assert.equal(shouldShowIosInstallHint(base), true);

  assert.equal(shouldShowIosInstallHint({ ...base, navigatorLike: { standalone: true } }), false);
  assert.equal(shouldShowIosInstallHint({ ...base, matchMedia: () => ({ matches: true }) }), false);
  assert.equal(
    shouldShowIosInstallHint({ ...base, storage: memoryStorage({ 'wyniki.iosInstallHintDismissed': '1' }) }),
    false,
  );
  assert.equal(shouldShowIosInstallHint({ ...base, userAgent: ANDROID_CHROME }), false);
});

function fakeRegistration() {
  const listeners = {};
  return {
    waiting: null,
    installing: null,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    emit: (type) => (listeners[type] || []).forEach((fn) => fn()),
  };
}

function fakeWorker() {
  const listeners = {};
  return {
    state: 'installing',
    posted: [],
    postMessage: (msg) => listeners.posted.push(msg),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    emit: (type) => (listeners[type] || []).forEach((fn) => fn()),
    _listeners: listeners,
  };
}

test('an update is announced once, and only when one is really waiting', () => {
  const registration = fakeRegistration();
  const worker = fakeWorker();

  let announced = 0;
  watchForUpdate(registration, () => { announced += 1; }, { controller: {} });

  registration.installing = worker;
  registration.emit('updatefound');
  worker.state = 'installing';
  worker.emit('statechange');
  assert.equal(announced, 0, 'still installing, nothing to offer yet');

  worker.state = 'installed';
  worker.emit('statechange');
  assert.equal(announced, 1);

  worker.emit('statechange');
  assert.equal(announced, 1, 'the reader is told once, not on every state change');
});

test('the very first install is not announced as an update', () => {
  const registration = fakeRegistration();
  const worker = fakeWorker();

  let announced = 0;
  // No controller: nothing was serving this page before, so this is a first install.
  watchForUpdate(registration, () => { announced += 1; }, { controller: null });
  registration.installing = worker;
  registration.emit('updatefound');
  worker.state = 'installed';
  worker.emit('statechange');

  assert.equal(announced, 0);
});

test('applying an update asks the waiting worker to take over', () => {
  const posted = [];
  applyUpdate({ waiting: { postMessage: (msg) => posted.push(msg) } });
  assert.deepEqual(posted, [{ type: SKIP_WAITING }]);

  assert.doesNotThrow(() => applyUpdate({ waiting: null }));
  assert.doesNotThrow(() => applyUpdate(null));
});

test('the page reloads once when the new worker takes control', () => {
  const listeners = {};
  const serviceWorker = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  let reloads = 0;
  reloadOnControllerChange(serviceWorker, () => { reloads += 1; });

  listeners.controllerchange.forEach((fn) => fn());
  listeners.controllerchange.forEach((fn) => fn());
  assert.equal(reloads, 1);
});

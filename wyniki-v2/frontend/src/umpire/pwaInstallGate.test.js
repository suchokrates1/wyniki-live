import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectOsInstalledPwa,
  enableInstalledPwa,
  isStandaloneDisplay,
  PWA_INSTALLED_KEY,
  pwaGateMode,
} from './pwaInstallGate.js';

test('gate stays hidden in standalone or after dismiss', () => {
  assert.equal(pwaGateMode({
    standalone: true, canInstall: true, osInstalled: true, dismissed: false,
  }), null);
  assert.equal(pwaGateMode({
    standalone: false, canInstall: true, osInstalled: true, dismissed: true,
  }), null);
});

test('open is offered when the PWA is already on the device', () => {
  assert.equal(pwaGateMode({
    standalone: false, canInstall: true, osInstalled: true, dismissed: false,
  }), 'open');
  assert.equal(pwaGateMode({
    standalone: false, canInstall: false, osInstalled: true, dismissed: false,
  }), 'open');
});

test('install is offered when Chrome can prompt and it is not installed yet', () => {
  assert.equal(pwaGateMode({
    standalone: false, canInstall: true, osInstalled: false, dismissed: false,
  }), 'install');
  assert.equal(pwaGateMode({
    standalone: false, canInstall: false, osInstalled: false, dismissed: false,
  }), null);
});

test('standalone display reads display-mode or iOS navigator.standalone', () => {
  assert.equal(isStandaloneDisplay({
    matchMedia: () => ({ matches: true }),
    navigator: {},
  }), true);
  assert.equal(isStandaloneDisplay({
    matchMedia: () => ({ matches: false }),
    navigator: { standalone: true },
  }), true);
  assert.equal(isStandaloneDisplay({
    matchMedia: () => ({ matches: false }),
    navigator: {},
  }), false);
});

test('detectOsInstalledPwa uses localStorage then related apps', async () => {
  assert.equal(await detectOsInstalledPwa({
    storage: { getItem: (key) => (key === PWA_INSTALLED_KEY ? '1' : null) },
  }), true);
  assert.equal(await detectOsInstalledPwa({
    storage: { getItem: () => null },
    getRelatedApps: async () => [{ platform: 'webapp', url: '/umpire.webmanifest' }],
  }), true);
  assert.equal(await detectOsInstalledPwa({
    storage: { getItem: () => null },
    getRelatedApps: async () => [],
  }), false);
});

test('enableInstalledPwa prefers fullscreen then Android intent', async () => {
  assert.equal(await enableInstalledPwa({
    requestFullscreen: async () => {},
  }), 'fullscreen');
  const assigned = [];
  assert.equal(await enableInstalledPwa({
    requestFullscreen: async () => {
      throw new Error('blocked');
    },
    userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/149',
    origin: 'https://test.blindtennis.app',
    assignLocation: (url) => assigned.push(url),
  }), 'intent');
  assert.match(assigned[0], /^intent:\/\/test\.blindtennis\.app\/umpire#Intent/);
});

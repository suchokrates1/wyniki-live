import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAdminModules } from '../../admin/merge.js';
import { createPinPad } from '../pinPad.js';
import { createUmpireCourtPinSlice } from './courtPinSlice.js';
import { createUmpireDirectorAndSyncSlice } from './directorAndSyncSlice.js';
import { createUmpireMatchFinishSlice } from './matchFinishSlice.js';
import { createUmpireMatchScreenSlice } from './matchScreenSlice.js';
import { createUmpireNavigationSlice } from './navigationSlice.js';
import { createUmpirePlayersAndConfigSlice } from './playersAndConfigSlice.js';
import { createUmpirePwaShellSlice } from './pwaShellSlice.js';
import { createUmpireSettingsHistoryPanicSlice } from './settingsHistoryPanicSlice.js';
import { createUmpireTutorialSlice } from './tutorialSlice.js';

test('merged umpire PWA slices expose every screen, scoring, sync, and tutorial method without collisions', () => {
  const slices = [
    createUmpireNavigationSlice({ session: {}, wakeLock: { active: false, request() {}, release() {} } }),
    createUmpirePwaShellSlice(),
    createUmpireDirectorAndSyncSlice({ api: {}, session: {} }),
    createUmpireCourtPinSlice({ api: {}, session: {}, pinPad: createPinPad() }),
    createUmpirePlayersAndConfigSlice({ api: {}, session: {} }),
    createUmpireSettingsHistoryPanicSlice({ api: {}, session: {} }),
    createUmpireTutorialSlice({ session: {} }),
    createUmpireMatchScreenSlice({ wakeLock: { active: false, request() {}, release() {} } }),
    createUmpireMatchFinishSlice({ session: {}, wakeLock: { active: false, request() {}, release() {} } }),
  ];

  // Ensure no two slices accidentally define the same property key
  const seen = new Set();
  for (const slice of slices) {
    for (const key of Object.keys(slice)) {
      assert.equal(seen.has(key), false, `duplicate slice key: ${key}`);
      seen.add(key);
    }
  }

  const merged = mergeAdminModules(...slices);
  for (const required of [
    'pwaGate',
    'initOffline',
    'syncMatch',
    'flushOutbox',
    'loadTournaments',
    'loadCourts',
    'submitPin',
    'loadPlayers',
    'startMatch',
    'openPanic',
    'diagnosticsRows',
    'startTutorial',
    'chooseServer',
    'basicWin',
    'advancedServe',
    'askUndo',
    'pickFinishReason',
    'nextMatch',
  ]) {
    assert.equal(typeof merged[required], 'function', `missing method ${required}`);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { canRequestFullscreen, isFullscreen } from './fullscreen.js';

test('canRequestFullscreen is true when the standard API exists', () => {
  const doc = { documentElement: { requestFullscreen: () => {} } };
  assert.equal(canRequestFullscreen(doc), true);
  assert.equal(canRequestFullscreen({ documentElement: {} }), false);
});

test('isFullscreen reads the document element or display-mode', () => {
  assert.equal(isFullscreen({ fullscreenElement: null, webkitFullscreenElement: null }, {
    matchMedia: () => ({ matches: false }),
  }), false);
  assert.equal(isFullscreen({ fullscreenElement: {}, webkitFullscreenElement: null }, {
    matchMedia: () => ({ matches: false }),
  }), true);
  assert.equal(isFullscreen({ fullscreenElement: null, webkitFullscreenElement: null }, {
    matchMedia: () => ({ matches: true }),
  }), true);
});

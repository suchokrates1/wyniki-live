import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTheme, normalizeTheme, readTheme, saveTheme } from './theme.js';

test('theme persists light/dark/system', () => {
  const store = {
    data: {},
    getItem(key) { return this.data[key] ?? null; },
    setItem(key, value) { this.data[key] = value; },
  };
  assert.equal(normalizeTheme('nope'), 'system');
  assert.equal(saveTheme('dark', store), 'dark');
  assert.equal(readTheme(store), 'dark');
  const root = { dataset: {} };
  applyTheme('light', root);
  assert.equal(root.dataset.theme, 'light');
});

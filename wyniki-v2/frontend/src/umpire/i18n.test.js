import assert from 'node:assert/strict';
import test from 'node:test';
import { AVAILABLE_LANGUAGES } from './session.js';
import { SCORING_I18N_KEYS, umpireLocaleKeys, umpireText } from './i18n.js';

test('every Android language has the same umpire keys as English', () => {
  const expected = umpireLocaleKeys('en');
  for (const { code } of AVAILABLE_LANGUAGES) {
    assert.deepEqual(umpireLocaleKeys(code), expected, code);
  }
});

test('scoring buttons are not leftover Polish outside pl', () => {
  const polishOnly = ['AS', 'BŁĄD', 'BŁĄD STOPY', 'PIŁKA W GRZE', 'WYGRANY', 'WYMUSZONY', 'NIEWYMUSZONY', 'PODWÓJNY BŁĄD', '2. SERWIS'];
  for (const { code } of AVAILABLE_LANGUAGES) {
    if (code === 'pl') continue;
    for (const key of SCORING_I18N_KEYS) {
      const value = umpireText(code, key);
      assert.ok(value, `${code}.${key}`);
      assert.equal(polishOnly.includes(value), false, `${code}.${key}=${value}`);
    }
  }
  assert.equal(umpireText('de', 'ace'), 'ASS');
  assert.equal(umpireText('de', 'ballInPlay'), 'BALL IM SPIEL');
});

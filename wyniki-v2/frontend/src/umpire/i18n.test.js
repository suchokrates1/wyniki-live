import assert from 'node:assert/strict';
import test from 'node:test';
import androidStrings from './i18nAndroid.json' with { type: 'json' };
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

test('English titles match Android, not the old PWA wording', () => {
  assert.equal(umpireText('en', 'languageTitle'), 'Select Language');
  assert.equal(umpireText('en', 'tournamentTitle'), 'Select Tournament');
  assert.equal(umpireText('en', 'courtTitle'), 'Select Court');
  assert.equal(umpireText('en', 'pinTitle'), 'Court Authorization');
  assert.equal(umpireText('en', 'playersTitle'), 'Select Players');
  assert.equal(umpireText('en', 'configTitle'), 'Match Setup');
  assert.equal(umpireText('en', 'serveTitle'), 'Who serves first?');
  assert.equal(umpireText('en', 'singles'), 'Singles');
  assert.equal(umpireText('en', 'historyEmpty'), 'No matches saved yet');
  assert.equal(umpireText('en', 'finishMatch'), 'Finish Match');
});

test('all umpire locales keep Android language titles', () => {
  assert.equal(umpireText('pl', 'languageTitle'), 'Wybierz język');
  assert.equal(umpireText('de', 'languageTitle'), 'Sprache auswählen');
  assert.equal(umpireText('es', 'languageTitle'), 'Seleccionar idioma');
  assert.equal(umpireText('fr', 'languageTitle'), 'Sélectionner la langue');
  assert.equal(umpireText('it', 'languageTitle'), 'Seleziona lingua');
  assert.equal(umpireText('lt', 'languageTitle'), 'Pasirinkite kalbą');
  assert.equal(umpireText('de', 'singles'), 'Einzel');
  assert.equal(umpireText('pl', 'courtName', { name: '1' }), 'Kort 1');
});

test('every locale keeps Android labels 1:1 for shared keys', () => {
  const keys = [
    'languageTitle', 'tournamentTitle', 'courtTitle', 'pinTitle', 'playersTitle',
    'configTitle', 'serveTitle', 'courtName', 'occupied', 'available', 'singles',
    'doubles', 'historyEmpty', 'finishMatch', 'bracketWarningTitle',
    'bracketWarningDifferentGroups', 'bracketWarningFriendly', 'selectedCount',
    'gameTypeSingles', 'chooseManually', 'applySuggestion',
  ];
  for (const { code } of AVAILABLE_LANGUAGES) {
    const android = androidStrings[code];
    assert.ok(android, code);
    for (const key of keys) {
      assert.equal(umpireText(code, key), android[key], `${code}.${key}`);
    }
    assert.ok(umpireText(code, 'courtName', { name: '1' }).includes('1'), `${code}.courtName`);
  }
});

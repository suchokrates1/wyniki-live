import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LANGUAGE, LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from './locale.js';
import { OFFICE_TRANSLATION_PATCHES } from './officeTranslations.js';
import { applyTranslationPatches } from './runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from './translations.js';
import { findMissingTranslationKeys } from './validation.js';

applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);
applyTranslationPatches(TRANSLATIONS, OFFICE_TRANSLATION_PATCHES);

test('supported languages include Lithuanian with native label', () => {
  assert.ok(SUPPORTED_LANGUAGES.includes('lt'));
  assert.equal(LANGUAGE_LABELS.lt, 'Lietuvių');
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(typeof LANGUAGE_LABELS[lang], 'string');
    assert.ok(LANGUAGE_LABELS[lang].length > 0);
  }
});

test('findMissingTranslationKeys fails when a language omits a PL key', () => {
  const missing = findMissingTranslationKeys(
    { pl: { office: { doubles: 'Debel' } }, en: { office: {} } },
    ['pl', 'en'],
    'pl',
  );
  assert.deepEqual(missing, [{ lang: 'en', key: 'office.doubles' }]);
});

test('every supported language has the full PL public and office catalog', () => {
  assert.deepEqual(
    findMissingTranslationKeys(TRANSLATIONS, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE),
    [],
  );
});

test('doubles and pair keys exist in every language after patches', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const catalog = TRANSLATIONS[lang];
    assert.equal(typeof catalog.bracket.pair, 'string', `${lang} bracket.pair`);
    assert.equal(typeof catalog.accessibility.unknownPair, 'string', `${lang} accessibility.unknownPair`);
    assert.equal(typeof catalog.office.planning.doubles, 'string', `${lang} office.planning.doubles`);
    assert.equal(typeof catalog.office.progress.pairs, 'string', `${lang} office.progress.pairs`);
    assert.equal(typeof catalog.office.modals.teamA, 'string', `${lang} office.modals.teamA`);
    assert.ok(catalog.office.planning.doubles.length > 0);
    assert.ok(!/zawodnik/i.test(catalog.office.status.knockoutWaiting), `${lang} knockoutWaiting still says zawodnik`);
  }
  assert.equal(TRANSLATIONS.pl.office.planning.doubles, 'Debel');
  assert.equal(TRANSLATIONS.lt.office.planning.doubles, 'Dvejetai');
  assert.equal(TRANSLATIONS.de.office.planning.doubles, 'Doppel');
  assert.equal(TRANSLATIONS.lt.htmlLang, 'lt');
});

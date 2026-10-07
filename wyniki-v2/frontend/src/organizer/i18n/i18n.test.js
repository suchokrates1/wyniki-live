import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { TEXTS, formatDate, pickLanguage, plural, translate } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fields = (text) => new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const sameFields = (a, b) => [...fields(a)].sort().join() === [...fields(b)].sort().join();

test('every language has every key, with the same placeholders and nothing empty', () => {
  const reference = TEXTS.pl;
  assert.deepEqual(Object.keys(TEXTS).sort(), ['de', 'en', 'es', 'fr', 'it', 'lt', 'pl']);
  for (const [lang, texts] of Object.entries(TEXTS)) {
    assert.deepEqual(Object.keys(texts).sort(), Object.keys(reference).sort(), lang);
    for (const [key, value] of Object.entries(texts)) {
      if (typeof value === 'object') {
        assert.ok(value.other, `${lang}.${key} needs an "other" form`);
        for (const form of Object.values(value)) assert.ok(sameFields(form, reference[key].other), `${lang}.${key}`);
      } else {
        assert.ok(value.trim(), `${lang}.${key} is empty`);
        assert.ok(sameFields(value, reference[key]), `${lang}.${key}: ${value}`);
      }
    }
  }
});

test('every key the pages and modules ask for exists', () => {
  const organizerDir = join(here, '..');
  const sources = [
    ...readdirSync(join(organizerDir, 'partials')).map((name) => join(organizerDir, 'partials', name)),
    ...readdirSync(organizerDir).filter((name) => name.endsWith('.js') && !name.endsWith('.test.js')).map((name) => join(organizerDir, name)),
    join(organizerDir, '..', 'organizer.js'),
    join(organizerDir, '..', 'organizerLogin.js'),
    join(organizerDir, '..', '..', 'organizer.html'),
    join(organizerDir, '..', '..', 'organizer-login.html'),
  ];
  const asked = new Set();
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    // a whole key only: ot('preset' + key) builds its keys, the presets are checked below
    for (const match of source.matchAll(/\b(?:t|tp|ot)\(\s*'([A-Za-z]+)'\s*[,)]/g)) asked.add(match[1]);
    for (const match of source.matchAll(/data-t(?:-[a-z]+)?="([A-Za-z]+)"/g)) asked.add(match[1]);
  }
  assert.ok(asked.size > 100, `only ${asked.size} keys found: is the scan still right?`);
  for (const preset of ['B1K', 'B1M', 'B2K', 'B2M', 'B3K', 'B3M', 'B4K', 'B4M']) asked.add(`preset${preset}`);
  const missing = [...asked].filter((key) => !(key in TEXTS.pl));
  assert.deepEqual(missing, []);
});

test('plurals follow each language', () => {
  assert.equal(plural('pl', 'tournamentsCount', 1), '1 turniej');
  assert.equal(plural('pl', 'tournamentsCount', 3), '3 turnieje');
  assert.equal(plural('pl', 'tournamentsCount', 5), '5 turniejów');
  assert.equal(plural('en', 'entriesCount', 1), '1 entry');
  assert.equal(plural('en', 'entriesCount', 2), '2 entries');
  assert.equal(plural('lt', 'tournamentsCount', 21), '21 turnyras');
  assert.equal(plural('lt', 'tournamentsCount', 10), '10 turnyrų');
  assert.equal(plural('it', 'tournamentsCount', 1000000), '1000000 tornei', 'a missing "many" falls back to "other"');
});

test('texts fill their placeholders and fall back to English', () => {
  assert.equal(translate('de', 'courtPin', { name: '2' }), 'PIN von Platz 2');
  assert.equal(translate('xx', 'signIn'), 'Sign in');
  assert.equal(translate('pl', 'noSuchKey'), 'noSuchKey');
});

test('the language comes from the address, then memory, then the browser', () => {
  assert.equal(pickLanguage({ search: '?lang=de', stored: 'fr' }), 'de');
  assert.equal(pickLanguage({ search: '?lang=xx', stored: 'fr' }), 'fr');
  assert.equal(pickLanguage({ navigatorLanguages: ['lt-LT', 'en'] }), 'lt');
  assert.equal(pickLanguage({ navigatorLanguages: ['ja-JP'] }), 'en');
});

test('dates as each language writes them', () => {
  assert.equal(formatDate('pl', '2027-10-31'), '31.10.2027');
  assert.equal(formatDate('en', '2027-10-31'), '31/10/2027');
  assert.equal(formatDate('lt', '2027-10-31'), '2027-10-31');
});

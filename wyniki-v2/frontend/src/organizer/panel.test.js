import assert from 'node:assert/strict';
import test from 'node:test';
import { entriesText, personLine } from './playersView.js';
import { organizerHash, parseOrganizerHash } from './routing.js';
import { logLine, settingsForm } from './tournamentView.js';

test('the address names the series, the tournament and its tab', () => {
  assert.deepEqual(parseOrganizerHash('#/twt'), { slug: 'twt', tournamentId: null, tab: '' });
  assert.deepEqual(parseOrganizerHash('#/twt/t/31'), { slug: 'twt', tournamentId: 31, tab: 'ustawienia' });
  assert.deepEqual(parseOrganizerHash('#/twt/t/31/zawodnicy'), { slug: 'twt', tournamentId: 31, tab: 'zawodnicy' });
  assert.deepEqual(parseOrganizerHash('#/twt/t/31/nic'), { slug: 'twt', tournamentId: 31, tab: 'ustawienia' });
  assert.deepEqual(parseOrganizerHash('#/twt/t/abc'), { slug: 'twt', tournamentId: null, tab: '' });
  assert.equal(organizerHash({ slug: 'twt', tournamentId: 31, tab: 'ustawienia' }), '#/twt/t/31');
  assert.equal(organizerHash({ slug: 'twt', tournamentId: 31, tab: 'korty' }), '#/twt/t/31/korty');
  assert.equal(organizerHash({ slug: 'twt' }), '#/twt');
});

test('the settings form starts from the tournament, with an empty office password', () => {
  const form = settingsForm({ name: 'Düren', court_count: '3', is_public: 1, is_simulation: 0, has_office_password: 1 });
  assert.equal(form.court_count, 3);
  assert.equal(form.is_public, true);
  assert.equal(form.office_password, '');
  assert.equal(form.title_scope, 'open');
});

test('the log speaks Polish, and an unknown action shows as it is', () => {
  assert.equal(logLine({ action: 'court_pin' }), 'zmieniono PIN kortu');
  assert.equal(logLine({ action: 'something_new' }), 'something_new');
});

test('entries are counted in Polish', () => {
  assert.equal(entriesText(1), '1 zgłoszenie');
  assert.equal(entriesText(3), '3 zgłoszenia');
  assert.equal(entriesText(12), '12 zgłoszeń');
  assert.equal(entriesText(22), '22 zgłoszenia');
  assert.equal(entriesText(0), '0 zgłoszeń');
});

test('a person in one line', () => {
  assert.equal(personLine({ category: 'B2', country: 'DE', gender: 'K' }), 'B2 · DE · kobieta');
  assert.equal(personLine({ category: 'B1' }), 'B1');
});

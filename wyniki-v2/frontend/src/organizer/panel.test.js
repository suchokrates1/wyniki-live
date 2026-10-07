import assert from 'node:assert/strict';
import test from 'node:test';
import { CallError, errorKeyFor } from './api.js';
import { translate } from './i18n/index.js';
import { daysKey, daysLeft, planState, yearLimitReached, yearUsage } from './plan.js';
import { personLine } from './playersView.js';
import { organizerHash, parseOrganizerHash } from './routing.js';
import { logKey, settingsForm } from './tournamentView.js';

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

test('every log action has a text, an unknown one shows as it is', () => {
  assert.equal(translate('pl', logKey({ action: 'court_pin' })), 'zmieniono PIN kortu');
  assert.equal(translate('de', logKey({ action: 'entry_add_global' })), 'Spieler aus der Datenbank hinzugefügt');
  assert.equal(logKey({ action: 'something_new' }), null);
});

test('a server error becomes a text key, with the limit to fill in', () => {
  assert.equal(errorKeyFor('Court limit exceeded'), 'errCourtLimit');
  assert.equal(errorKeyFor('Cannot remove active courts: t1-2'), 'errBusyCourt');
  assert.equal(errorKeyFor('Something new'), 'errSave');
  const error = new CallError('errCourtLimit', { n: 4 });
  assert.equal(translate('en', error.key, error.vars), 'The subscription allows at most 4 courts per tournament.');
});

test('a person in one line, gender in the reader language', () => {
  const de = (key) => translate('de', key);
  assert.equal(personLine({ category: 'B2', country: 'DE', gender: 'K' }, de), 'B2 · DE · weiblich');
  assert.equal(personLine({ category: 'B1' }), 'B1');
});

test('days left and the state of the subscription', () => {
  const today = new Date('2027-10-17T10:00:00Z');
  assert.equal(daysLeft('2027-10-31', today), 14);
  assert.equal(planState('2027-10-31', today), 'ending');
  assert.equal(planState('2027-11-30', today), 'ok');
  assert.equal(planState('2027-10-16', today), 'ended');
  assert.equal(planState('', today), 'ok');
  assert.equal(planState('2027-10-17', today), 'ending', 'the last day still counts');
  assert.deepEqual(daysKey(0), { key: 'today' });
  assert.deepEqual(daysKey(1), { key: 'tomorrow' });
  assert.equal(translate('pl', daysKey(5).key, { n: 5 }), 'za 5 dni');
  assert.equal(translate('en', daysKey(5).key, { n: 5 }), 'in 5 days');
  const series = { max_tournaments_per_year: 2, tournaments: [{ start_date: '2027-03-01' }, { start_date: '2026-07-17' }] };
  assert.deepEqual(yearUsage(series, 2027), { used: 1, limit: 2 });
  assert.equal(yearLimitReached(series, 2027), false);
  assert.equal(yearUsage({ max_tournaments_per_year: 0 }, 2027), null);
});

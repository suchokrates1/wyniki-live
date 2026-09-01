import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AVAILABLE_LANGUAGES,
  createUmpireSession,
  firstScreen,
  parseExpiresAt,
  todayKey,
} from './session.js';

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

test('language skip only after an explicit choice is stored', () => {
  const session = createUmpireSession({ localStore: memoryStore(), sessionStore: memoryStore() });
  assert.equal(session.hasLanguageSelected(), false);
  assert.equal(firstScreen({ hasLanguage: false }), 'language');
  session.setLanguage('pl');
  assert.equal(session.hasLanguageSelected(), true);
  assert.equal(session.getLanguage(), 'pl');
  assert.equal(firstScreen({ hasLanguage: true }), 'tournament');
  assert.equal(firstScreen({ hasLanguage: true, forceLanguage: true }), 'language');
});

test('Android language list is complete', () => {
  assert.deepEqual(AVAILABLE_LANGUAGES.map((item) => item.code), ['de', 'en', 'es', 'fr', 'it', 'lt', 'pl']);
});

test('tournament selection expires the next calendar day', () => {
  const localStore = memoryStore();
  const dayOne = createUmpireSession({
    localStore,
    sessionStore: memoryStore(),
    now: () => new Date('2026-09-01T10:00:00'),
  });
  dayOne.saveTournament({ id: 31, name: 'Vilnius' });
  assert.equal(dayOne.getTournamentForToday().id, 31);

  const dayTwo = createUmpireSession({
    localStore,
    sessionStore: memoryStore(),
    now: () => new Date('2026-09-02T10:00:00'),
  });
  assert.equal(dayTwo.getTournamentForToday(), null);
});

test('court token is valid only before expiry', () => {
  const session = createUmpireSession({ localStore: memoryStore(), sessionStore: memoryStore() });
  session.saveCourtSession({ courtId: 't31-1', token: 'abc', expiresAtMillis: 2_000 });
  assert.equal(session.hasValidCourtToken(1_000), true);
  assert.equal(session.hasValidCourtToken(2_000), false);
});

test('parseExpiresAt accepts unix seconds and ISO', () => {
  assert.equal(parseExpiresAt(1_700_000_000), 1_700_000_000_000);
  assert.equal(parseExpiresAt('2026-09-01T12:00:00.000Z'), Date.parse('2026-09-01T12:00:00.000Z'));
});

test('todayKey is yyyy-mm-dd', () => {
  assert.equal(todayKey(new Date('2026-09-01T23:00:00')), '2026-09-01');
});

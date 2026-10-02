import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTournamentsListView,
  sortTournamentsForAdmin,
  tournamentMatchesQuery,
  tournamentMeta,
  tournamentState,
} from './tournamentsList.js';

const giebultow = { id: 32, name: 'RAKIETY ATNiS VII', start_date: '2026-09-26', end_date: '2026-09-27', city: 'Giebułtów', country: 'PL', court_count: 4, active: 1, is_public: 1, stats_enabled: 1, is_simulation: 0 };
const wilno = { id: 31, name: 'IBTA World Championships', start_date: '2026-08-27', end_date: '2026-08-29', city: 'Wilno', country: 'LT', court_count: 11, active: 0, is_public: 1, stats_enabled: 1, is_simulation: 0 };
const review = { id: 26, name: 'App Review Access', start_date: '2026-05-23', end_date: '2027-05-23', city: 'Review', country: 'US', court_count: 1, active: 1, is_public: 0, stats_enabled: 0, is_simulation: 1 };

test('the state chip says what the tournament is right now', () => {
  assert.equal(tournamentState(giebultow, '2026-10-02').label, 'AKTYWNY');
  assert.equal(tournamentState(wilno, '2026-10-02').label, 'ARCHIWUM');
  assert.equal(tournamentState(review, '2026-10-02').label, 'SYMULACJA');
  assert.equal(tournamentState({ start_date: '2026-12-01', active: 0 }, '2026-10-02').label, 'NADCHODZĄCY');
});

test('the meta line carries dates, place, courts and what the flags turn off', () => {
  assert.equal(tournamentMeta(giebultow), '26.09–27.09 · Giebułtów, PL · 4 korty');
  assert.equal(tournamentMeta(review), '23.05–23.05 · Review, US · 1 kort · niepubliczny · bez statystyk');
});

test('search covers name, city and date', () => {
  assert.ok(tournamentMatchesQuery(giebultow, 'rakiety'));
  assert.ok(tournamentMatchesQuery(giebultow, 'giebuł'));
  assert.ok(tournamentMatchesQuery(giebultow, '2026-09'));
  assert.ok(tournamentMatchesQuery(giebultow, ''));
  assert.ok(!tournamentMatchesQuery(giebultow, 'wilno'));
});

test('the tournament being run sits on top, the rest newest first', () => {
  const order = sortTournamentsForAdmin([wilno, review, giebultow]).map((item) => item.id);
  assert.deepEqual(order, [32, 26, 31]);
});

test('rows are filtered by the search box and carry the switch state', () => {
  const view = Object.assign({ tournaments: [wilno, giebultow] }, createTournamentsListView());
  assert.equal(view.adminTournamentCount(), 2);
  assert.deepEqual(view.adminTournamentRows().map((row) => row.id), [32, 31]);
  assert.equal(view.adminTournamentRows()[0].isActive, true);
  view.tournamentSearch = 'wilno';
  assert.deepEqual(view.adminTournamentRows().map((row) => row.id), [31]);
  assert.equal(view.adminTournamentRows()[0].isActive, false);
});

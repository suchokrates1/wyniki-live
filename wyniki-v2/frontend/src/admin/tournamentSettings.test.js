import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTournamentSettingsView,
  fieldsFor,
  flagsFor,
  TOURNAMENT_FIELDS,
  tournamentHeadline,
} from './tournamentSettings.js';

test('every field the old edit screen had is still here, each with its own id', () => {
  const keys = TOURNAMENT_FIELDS.map((field) => field.key);
  for (const key of ['name', 'start_date', 'end_date', 'court_count', 'city', 'country', 'report_email', 'access_key']) {
    assert.ok(keys.includes(key), key);
  }
  const ids = fieldsFor('adm-edit').map((field) => field.id);
  assert.ok(ids.includes('adm-edit-start-date'));
  assert.equal(new Set(ids).size, ids.length);
});

test('a simulation cannot be public and cannot count towards profiles', () => {
  const normal = flagsFor({ is_simulation: false });
  assert.deepEqual(normal.filter((flag) => flag.disabled), []);
  const simulation = flagsFor({ is_simulation: true });
  assert.deepEqual(simulation.filter((flag) => flag.disabled).map((flag) => flag.key), ['is_public', 'stats_enabled']);
});

test('the headline repeats dates, place and courts', () => {
  assert.equal(
    tournamentHeadline({ start_date: '2026-09-26', end_date: '2026-09-27', city: 'Giebułtów', country: 'PL', court_count: 4 }),
    '26.09–27.09 · Giebułtów, PL · 4 korty',
  );
  assert.equal(tournamentHeadline({}), '');
});

test('the view reads the tournament being edited', () => {
  const view = Object.assign({ editTournament: { name: 'Cup', city: 'Wilno', court_count: 1, is_simulation: true } }, createTournamentSettingsView());
  assert.equal(view.adminEditTournamentMeta(), 'Wilno · 1 kort');
  assert.equal(view.adminTournamentFlags().filter((flag) => flag.disabled).length, 2);
  assert.equal(view.adminTournamentFields().length, TOURNAMENT_FIELDS.length);
});

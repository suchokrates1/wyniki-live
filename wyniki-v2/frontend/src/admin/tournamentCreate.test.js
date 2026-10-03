import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CREATE_FIELDS,
  createFieldsFor,
  createTournamentCreateView,
  createTournamentDraft,
  missingCreateFields,
} from './tournamentCreate.js';

test('a new tournament needs a name and both dates', () => {
  assert.deepEqual(missingCreateFields({}), ['name', 'start_date', 'end_date']);
  assert.deepEqual(missingCreateFields({ name: 'Cup', start_date: '2026-11-01', end_date: '2026-11-02' }), []);
  assert.deepEqual(missingCreateFields({ name: '  ', start_date: '2026-11-01', end_date: '2026-11-02' }), ['name']);
});

test('the draft starts public, counting, and not a simulation', () => {
  const draft = createTournamentDraft();
  assert.equal(draft.is_public, true);
  assert.equal(draft.stats_enabled, true);
  assert.equal(draft.is_simulation, false);
  assert.equal(draft.court_count, 1);
});

test('fields carry ids, and the dialog never offers the active switch', () => {
  assert.equal(createFieldsFor('adm-new')[0].id, 'adm-new-name');
  assert.equal(createFieldsFor('adm-new').length, CREATE_FIELDS.length);
  const view = Object.assign({}, createTournamentCreateView());
  assert.deepEqual(view.adminCreateFlags().map((flag) => flag.key), ['is_public', 'stats_enabled', 'is_simulation']);
});

test('submitting an empty form explains what is missing and does not call the API', async () => {
  let created = 0;
  const view = Object.assign({
    newTournament: createTournamentDraft(),
    tournaments: [],
    $nextTick: (fn) => fn(),
    createTournament: async () => { created += 1; },
  }, createTournamentCreateView());
  view.tournamentCreateOpen = true;
  await view.submitTournamentCreate();
  assert.equal(created, 0);
  assert.match(view.tournamentCreateError, /Nazwa i obie daty/);
  assert.equal(view.tournamentCreateOpen, true);
});

test('a saved tournament closes the dialog; a failed save keeps it open with the data', async () => {
  const view = Object.assign({
    newTournament: { ...createTournamentDraft(), name: 'Cup', start_date: '2026-11-01', end_date: '2026-11-02' },
    tournaments: [],
    $nextTick: (fn) => fn(),
    createTournament: async function () { this.tournaments = [{ id: 1 }]; },
  }, createTournamentCreateView());
  view.tournamentCreateOpen = true;
  await view.submitTournamentCreate();
  assert.equal(view.tournamentCreateOpen, false);

  const failing = Object.assign({
    newTournament: { ...createTournamentDraft(), name: 'Cup', start_date: '2026-11-01', end_date: '2026-11-02' },
    tournaments: [],
    $nextTick: (fn) => fn(),
    createTournament: async () => {},
  }, createTournamentCreateView());
  failing.tournamentCreateOpen = true;
  await failing.submitTournamentCreate();
  assert.equal(failing.tournamentCreateOpen, true);
  assert.equal(failing.newTournament.name, 'Cup');
});

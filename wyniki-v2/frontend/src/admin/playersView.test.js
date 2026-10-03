import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlayersView,
  entryForGlobalPlayer,
  playerAge,
  playerFullName,
  playerMeta,
} from './playersView.js';

const ciborowski = { id: 7, first_name: 'Mateusz', last_name: 'Ciborowski', country: 'PL', category: 'B2', birth_date: '1990-05-10' };
const praskeviciene = { id: 9, first_name: 'Indrė', last_name: 'Zuzevičiūtė Praškevičienė', country: 'LT', category: 'B2' };

test('a player is named by first and last name, with a fallback', () => {
  assert.equal(playerFullName(ciborowski), 'Mateusz Ciborowski');
  assert.equal(playerFullName({ name: 'Stypa' }), 'Stypa');
  assert.equal(playerFullName({}), '—');
});

test('age counts whole years and ignores nonsense dates', () => {
  assert.equal(playerAge({ birth_date: '1990-05-10' }, new Date('2026-10-02')), 36);
  assert.equal(playerAge({ birth_date: '1990-11-10' }, new Date('2026-10-02')), 35);
  assert.equal(playerAge({ birth_date: '' }), null);
  assert.equal(playerAge({ birth_date: '1700-01-01' }, new Date('2026-10-02')), null);
});

test('a tournament entry is matched by id, and for older entries by name', () => {
  assert.ok(entryForGlobalPlayer(ciborowski, [{ global_player_id: 7, last_name: 'Ciborowski' }]));
  assert.ok(entryForGlobalPlayer(ciborowski, [{ first_name: 'Mateusz', last_name: 'Ciborowski' }]));
  assert.equal(entryForGlobalPlayer(ciborowski, [{ global_player_id: 8 }]), null);
});

test('the meta line carries country, class and age', () => {
  assert.equal(playerMeta({ country: 'PL', category: 'B2', birth_date: '1990-05-10' }).startsWith('PL · B2 · '), true);
  assert.equal(playerMeta({ country: 'LT' }), 'LT');
});

test('rows say who is already entered and who can be added', () => {
  const view = Object.assign({
    globalPlayers: [ciborowski, praskeviciene],
    players: [{ global_player_id: 7 }],
    tournaments: [{ id: 32, name: 'RAKIETY ATNiS VII' }],
    selectedTournament: 32,
  }, createPlayersView());
  const rows = view.adminPlayerRows();
  assert.deepEqual(rows.map((row) => row.inTournament), [true, false]);
  assert.deepEqual(rows.map((row) => row.canAdd), [false, true]);
  assert.equal(view.adminPlayersTournamentName(), 'RAKIETY ATNiS VII');
});

test('without a chosen tournament nobody can be added yet', () => {
  const view = Object.assign({ globalPlayers: [ciborowski], players: [], tournaments: [], selectedTournament: null }, createPlayersView());
  assert.deepEqual(view.adminPlayerRows().map((row) => row.canAdd), [false]);
  assert.equal(view.adminPlayersTournamentName(), '');
});

test('a new player needs a last name, and the dialog closes only when the base grew', async () => {
  const view = Object.assign({
    globalPlayers: [], newGlobalPlayer: {}, $nextTick: (fn) => fn(),
    createGlobalPlayer: async function () { this.globalPlayers = [ciborowski]; },
  }, createPlayersView());
  view.openPlayerCreate();
  await view.submitPlayerCreate();
  assert.match(view.playerCreateError, /Nazwisko/);
  assert.equal(view.playerCreateOpen, true);

  view.newGlobalPlayer.last_name = 'Ciborowski';
  await view.submitPlayerCreate();
  assert.equal(view.playerCreateOpen, false);
});

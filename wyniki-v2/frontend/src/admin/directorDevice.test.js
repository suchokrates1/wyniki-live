import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTabletToDirectorForm,
  directorDeviceCard,
  filterTournamentPlayers,
  formatClock,
  playerDisplayName,
  tennisPoints,
  tournamentIdFromCourtId,
} from './directorDevice.js';

test('tennis points match overlay display', () => {
  assert.equal(tennisPoints(0, 0), '0:0');
  assert.equal(tennisPoints(1, 0), '15:0');
  assert.equal(tennisPoints(2, 3), '30:40');
  assert.equal(tennisPoints(4, 3), 'ADV:40');
  assert.equal(tennisPoints(3, 3), '40:40');
  assert.equal(tennisPoints(5, 4, { isTiebreak: true }), '5:4');
});

test('form is filled from the tablet snapshot, not the database row', () => {
  const form = applyTabletToDirectorForm({
    session_court_id: 't31-2',
    match_id: 671,
    player1_name: 'Stale DB',
    snapshot: {
      court_id: 't31-2',
      court_name: 'Kort 2',
      player1_name: 'Jessica González',
      player2_name: 'Daniela Schmidt',
      player1_sets: 0,
      player2_sets: 0,
      player1_games: 1,
      player2_games: 3,
      player1_points: 2,
      player2_points: 0,
      games_per_set: 4,
      sets_to_win: 2,
      no_advantage: true,
    },
  });
  assert.equal(form.player1Name, 'Jessica González');
  assert.equal(form.player1Games, 1);
  assert.equal(form.player1Points, 2);
  assert.equal(form.noAdvantage, true);
  assert.equal(form.courtId, 't31-2');
});

test('device card shows court, clock, names and live points', () => {
  const card = directorDeviceCard({
    platform: 'pwa',
    last_seen: new Date(1_700_000_000_000).toISOString(),
    snapshot: {
      court_id: 't31-2',
      court_name: 'Kort 2',
      player1_name: 'Ada Mid',
      player2_name: 'Bea Game',
      player1_games: 1,
      player2_games: 0,
      player1_points: 1,
      match_start_time_ms: 1_700_000_000_000 - 90_000,
      games_per_set: 4,
      sets_to_win: 1,
      is_player1_serving: true,
    },
  }, 1_700_000_000_000);
  assert.equal(card.title, 'Na tablecie teraz');
  assert.match(card.court, /Kort 2/);
  assert.equal(card.clock, '01:30');
  assert.equal(card.names, 'Ada Mid vs Bea Game');
  assert.match(card.score, /15:0/);
  assert.match(card.score, /serwuje strona 1/);
  assert.equal(card.fresh, true);
});

test('clock uses start time while the match is live', () => {
  assert.equal(formatClock({ match_start_time_ms: 1_000 }, 61_000), '01:00');
});

test('tournament id is read from the court id', () => {
  assert.equal(tournamentIdFromCourtId('t32-1'), 32);
  assert.equal(tournamentIdFromCourtId('t7-12'), 7);
  assert.equal(playerDisplayName({ first_name: 'Jessica', last_name: 'González' }), 'Jessica González');
});

test('director player search filters the tournament roster as you type', () => {
  const players = [
    { id: 1, first_name: 'Jessica', last_name: 'González', category: 'B1K' },
    { id: 2, first_name: 'Daniela', last_name: 'Schmidt', category: 'B1K' },
    { id: 3, first_name: 'Justyna', last_name: 'Stopierzyńska', category: 'B2K' },
  ];
  assert.equal(filterTournamentPlayers(players, '').length, 3);
  assert.deepEqual(filterTournamentPlayers(players, 'gonz').map((row) => row.id), [1]);
  assert.deepEqual(filterTournamentPlayers(players, 'B2').map((row) => row.last_name), ['Stopierzyńska']);
  assert.equal(filterTournamentPlayers(players, 'xyz').length, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { historyCard, resultsByDay } from './resultsModel.js';

const final = {
  id: 1, match_id: 11, ended_ts: '2026-08-29T13:36:46Z', kort_id: 'Main', phase: 'B1 Men — Finał', category: 'B1',
  player_a: 'Naqi Rizvi', player_b: 'Jani Kallunki', score_a: [1, 3], score_b: [4, 5], sets_history: [],
};
const lesznoFinal = {
  id: 2, match_id: 12, ended_ts: '2026-05-24T11:46:30Z', kort_id: '1', phase: 'B1 Mężczyźni — Finał',
  player_a: 'Sławomir Tolak-Ciszewski', player_b: 'Rafał Sudoł', score_a: [3, 4], score_b: [5, 2],
  sets_history: [
    { set_number: 1, player1_games: 3, player2_games: 5 },
    { set_number: 2, player1_games: 4, player2_games: 2 },
    { set_number: 3, player1_games: 6, player2_games: 10, is_super_tiebreak: true, tiebreak_loser_points: 6 },
  ],
};
const semi = { ...final, id: 3, match_id: 13, ended_ts: '2026-08-28T10:52:15Z', player_a: 'Jani Kallunki', player_b: 'Harufumi Shiozawa', score_a: [5, 5], score_b: [4, 4] };

test('a history row becomes the bracket card, winner from the sets, profiles linked', () => {
  const card = historyCard(final, { 'Jani Kallunki': { global_player_id: 175, country: 'FI' } });
  assert.deepEqual(card.rows.map((row) => [row.name, row.won, row.tag, row.href]), [
    ['Naqi Rizvi', false, '', ''],
    ['Jani Kallunki', true, 'FI', '#players/global/175'],
  ]);
});

test('a super tie-break kept only in the set history still decides the card', () => {
  const card = historyCard(lesznoFinal);
  assert.equal(card.rows[1].won, true);
  assert.deepEqual(card.rows[1].games.map((game) => [game.v, game.stb]), [[5, false], [2, false], [10, true]]);
});

test('results come in days, in the order the matches were given', () => {
  const days = resultsByDay([final, semi, lesznoFinal]);
  assert.deepEqual(days.map((day) => [day.key, day.matches.length]), [['2026-08-29', 1], ['2026-08-28', 1], ['2026-05-24', 1]]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHistoryScore, filterMatchHistory, getMatchSets, getMatchWinner, historyFilterOptions } from './history.js';

const lescanoPierri = {
  player_a: 'Rosana Lescano',
  player_b: 'Rosa Daniela Pierri',
  winner_name: 'Rosana Lescano',
  score_a: [4, 2],
  score_b: [2, 4],
  sets_history: [
    { is_super_tiebreak: false, player1_games: 4, player2_games: 2, set_number: 1 },
    { is_super_tiebreak: false, player1_games: 2, player2_games: 4, set_number: 2 },
    { is_super_tiebreak: true, player1_games: 10, player2_games: 3, set_number: 3 },
  ],
};

test('history includes STB from sets_history even when score arrays omit it', () => {
  const sets = getMatchSets(lescanoPierri);
  assert.deepEqual(sets, [
    { a: 4, b: 2, tb: null, isSuperTB: false },
    { a: 2, b: 4, tb: null, isSuperTB: false },
    { a: 10, b: 3, tb: null, isSuperTB: true },
  ]);
  assert.equal(getMatchWinner(lescanoPierri), 'A');
  assert.equal(
    formatHistoryScore(lescanoPierri.score_a, lescanoPierri.score_b, lescanoPierri.sets_history),
    '4:2, 2:4, [10:3]',
  );
});

test('history shows set TB as loser points, not a third games column', () => {
  const match = {
    score_a: [5, 4],
    score_b: [4, 5],
    sets_history: [
      { set_number: 1, player1_games: 5, player2_games: 4, tiebreak_loser_points: 1, is_super_tiebreak: false },
      { set_number: 2, player1_games: 4, player2_games: 5, tiebreak_loser_points: 5, is_super_tiebreak: false },
      { set_number: 3, player1_games: 10, player2_games: 7, is_super_tiebreak: true, tiebreak_loser_points: 7 },
    ],
  };
  const sets = getMatchSets(match);
  assert.deepEqual(sets, [
    { a: 5, b: 4, tb: 1, isSuperTB: false },
    { a: 4, b: 5, tb: 5, isSuperTB: false },
    { a: 10, b: 7, tb: null, isSuperTB: true },
  ]);
  assert.equal(formatHistoryScore(match.score_a, match.score_b, match.sets_history), '5:4(7:1), 4:5(5:7), [10:7]');
});

test('placeholder STB 0/1 games expands to tennis points', () => {
  const match = {
    score_a: [4, 2],
    score_b: [2, 4],
    sets_history: [
      { set_number: 1, player1_games: 4, player2_games: 2 },
      { set_number: 2, player1_games: 2, player2_games: 4 },
      { set_number: 3, player1_games: 1, player2_games: 0, is_super_tiebreak: true, tiebreak_loser_points: 3 },
    ],
  };
  assert.deepEqual(getMatchSets(match)[2], { a: 10, b: 3, tb: null, isSuperTB: true });
});

test('falls back to score arrays when sets_history is missing', () => {
  const match = { score_a: [4, 4], score_b: [2, 1] };
  assert.deepEqual(getMatchSets(match), [
    { a: 4, b: 2, tb: null, isSuperTB: false },
    { a: 4, b: 1, tb: null, isSuperTB: false },
  ]);
  assert.equal(getMatchWinner(match), 'A');
});

test('unflagged 10-point third set after a split is shown as STB', () => {
  const match = {
    score_a: [4, 2],
    score_b: [2, 4],
    sets_history: [
      { set_number: 1, player1_games: 4, player2_games: 2 },
      { set_number: 2, player1_games: 2, player2_games: 4 },
      { set_number: 3, player1_games: 10, player2_games: 7 },
    ],
  };
  assert.deepEqual(getMatchSets(match)[2], { a: 10, b: 7, tb: null, isSuperTB: true });
});

test('history filters by surname, category, court and date', () => {
  const matches = [
    { player_a: 'Mark Haskett', player_b: 'Davide Viglianti', category: 'B2 Men', kort_id: '2', ended_ts: '2026-08-28T10:00:00Z' },
    { player_a: 'Tess Whelan', player_b: 'Rosa Daniela Pierri', category: 'B1 Women', kort_id: '1', ended_ts: '2026-08-29T11:00:00Z' },
    { player_a: 'Nibin Mathew / Carlos Arbos', player_b: 'Jani Kallunki / Pekka Rantanen', category: 'B1 Men Doubles', kort_id: '3', ended_ts: '2026-08-27T17:00:00Z' },
  ];
  assert.equal(filterMatchHistory(matches, { search: 'haskett' }).length, 1);
  assert.equal(filterMatchHistory(matches, { search: 'arbos' })[0].category, 'B1 Men Doubles');
  assert.equal(filterMatchHistory(matches, { category: 'B1 Women' })[0].player_a, 'Tess Whelan');
  assert.equal(filterMatchHistory(matches, { court: '2' })[0].player_a, 'Mark Haskett');
  assert.equal(filterMatchHistory(matches, { date: '2026-08-27' })[0].category, 'B1 Men Doubles');
  const options = historyFilterOptions(matches);
  assert.deepEqual(options.dates, ['2026-08-29', '2026-08-28', '2026-08-27']);
  assert.equal(options.courts.length, 3);
});

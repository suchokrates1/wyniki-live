import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig, StatsMode } from '../match-engine/models.js';
import { matchState } from '../match-engine/testSupport.js';
import { finishWinnerName } from './matchPayload.js';
import { finishStatRows, finishStatValue } from './finishView.js';

test('basic finish stats omit aces and unforced errors', () => {
  const state = matchState({
    matchConfig: new MatchConfig({ statsMode: StatsMode.BASIC }),
    statsMode: StatsMode.BASIC,
  });
  assert.deepEqual(finishStatRows(state).map((row) => row.key), [
    'winnersStat',
    'doubleFaults',
    'firstServePct',
  ]);
});

test('advanced finish stats keep the Android rows', () => {
  const state = matchState({
    matchConfig: new MatchConfig({ statsMode: StatsMode.ADVANCED }),
    statsMode: StatsMode.ADVANCED,
  });
  assert.deepEqual(finishStatRows(state).map((row) => row.key), [
    'aces',
    'doubleFaults',
    'winnersStat',
    'unforcedErrors',
    'firstServePct',
  ]);
});

test('finish stat values read live match statistics', () => {
  const state = matchState({ statsMode: StatsMode.BASIC });
  state.player1Stats.winners = 8;
  state.player2Stats.winners = 3;
  state.player1Stats.firstServesIn = 8;
  state.player1Stats.firstServesTotal = 10;
  assert.equal(finishStatValue(state, { field: 'winners' }), '8 / 3');
  assert.equal(finishStatValue(state, { kind: 'pct' }), '80% / 0%');
});

test('finish winner falls back to set history when live sets are empty', () => {
  const state = matchState();
  state.player2Sets = 2;
  assert.equal(finishWinnerName(state), 'Nowak');
  state.player2Sets = 0;
  state.setsHistory.push({ setNumber: 1, player1Games: 0, player2Games: 4 });
  state.setsHistory.push({ setNumber: 2, player1Games: 0, player2Games: 4 });
  assert.equal(finishWinnerName(state), 'Nowak');
});

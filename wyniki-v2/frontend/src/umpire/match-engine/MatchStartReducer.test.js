import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchStartReducer } from './matchStartReducer.js';
import { matchState } from './testSupport.js';

test('singlesStartsWithFirstPlayerByDefault', () => {
  const state = matchState();

  MatchStartReducer.start(state, 99, 10_000);

  assert.equal(state.currentServer, 1);
  assert.equal(state.isPlayer1Serving, true);
  assert.equal(state.matchStartTime, 10_000);
});

test('singlesCanStartWithSecondPlayer', () => {
  const state = matchState();

  MatchStartReducer.start(state, 2, 10_000);

  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);
});

test('tiebreakOnlyCapturesOpeningServerAtStart', () => {
  const state = matchState();
  state.isSuperTiebreak = true;

  MatchStartReducer.start(state, 2, 10_000);

  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);
  assert.equal(state.tiebreakOpeningServer, 2);
});

test('doublesClampsServerNumberAndSetsServingTeam', () => {
  const state = matchState({ isDoubles: true });

  MatchStartReducer.start(state, 3, 10_000);

  assert.equal(state.currentServer, 3);
  assert.equal(state.isPlayer1Serving, true);

  MatchStartReducer.start(state, 9, 20_000);

  assert.equal(state.currentServer, 4);
  assert.equal(state.isPlayer1Serving, false);
});

test('manualStartTimeOverridesClock', () => {
  const state = matchState({ manualStartTime: 5_000 });

  MatchStartReducer.start(state, 1, 10_000);

  assert.equal(state.matchStartTime, 5_000);
});

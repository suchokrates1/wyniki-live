import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchActionReducer, MatchCommand } from './matchActionReducer.js';
import { MatchPointEvent } from './matchPointReducer.js';
import { matchState } from './testSupport.js';

test('startMatchCommandUsesStartReducer', () => {
  const state = matchState();

  MatchActionReducer.reduce(state, MatchCommand.StartMatch(2, 10_000));

  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);
  assert.equal(state.matchStartTime, 10_000);
});

test('aceRecordsFirstServeStatsAndAwardsPointToServer', () => {
  const state = matchState();
  state.isPlayer1Serving = true;
  state.isFirstServe = true;

  const result = MatchActionReducer.reduce(state, MatchCommand.Ace);

  assert.equal(state.player1Stats.aces, 1);
  assert.equal(state.player1Stats.firstServesIn, 1);
  assert.equal(state.player1Stats.firstServesTotal, 1);
  assert.equal(state.isFirstServe, true);
  assert.equal(result.pointWinner, true);
});

test('firstFaultMovesToSecondServeWithoutPoint', () => {
  const state = matchState();
  state.isPlayer1Serving = false;
  state.isFirstServe = true;

  const result = MatchActionReducer.reduce(state, MatchCommand.Fault);

  assert.equal(state.player2Stats.firstServesTotal, 1);
  assert.equal(state.isFirstServe, false);
  assert.equal(result.pointWinner, null);
});

test('secondFaultRecordsDoubleFaultAndAwardsPointToReceiver', () => {
  const state = matchState();
  state.isPlayer1Serving = false;
  state.isFirstServe = false;

  const result = MatchActionReducer.reduce(state, MatchCommand.Fault);

  assert.equal(state.player2Stats.doubleFaults, 1);
  assert.equal(state.player2Stats.secondServesTotal, 1);
  assert.equal(state.isFirstServe, true);
  assert.equal(result.pointWinner, true);
});

test('footFaultUsesSameScoringAsFault', () => {
  const state = matchState();
  state.isPlayer1Serving = true;
  state.isFirstServe = false;

  const result = MatchActionReducer.reduce(state, MatchCommand.FootFault);

  assert.equal(state.player1Stats.doubleFaults, 1);
  assert.equal(state.player1Stats.secondServesTotal, 1);
  assert.equal(result.pointWinner, false);
});

test('ballInPlayRecordsServeInAndTransitionsToRally', () => {
  const state = matchState();
  state.isPlayer1Serving = true;
  state.isFirstServe = false;

  const result = MatchActionReducer.reduce(state, MatchCommand.BallInPlay);

  assert.equal(state.player1Stats.secondServesIn, 1);
  assert.equal(state.player1Stats.secondServesTotal, 1);
  assert.equal(state.isFirstServe, true);
  assert.equal(result.transitionToRally, true);
  assert.equal(result.pointWinner, null);
});

test('pointWonCommandAddsPointAndReportsPointEvent', () => {
  const state = matchState();

  const result = MatchActionReducer.reduce(state, MatchCommand.PointWon(true));

  assert.equal(state.player1Points, 1);
  assert.equal(result.pointScored, true);
  assert.deepEqual(result.pointEvents, [MatchPointEvent.Point]);
});

test('winnerAwardsPointToWinner', () => {
  const state = matchState();

  const result = MatchActionReducer.reduce(state, MatchCommand.Winner(false));

  assert.equal(state.player2Stats.winners, 1);
  assert.equal(result.pointWinner, false);
});

test('errorsAwardPointToOpponent', () => {
  const forcedState = matchState();
  const unforcedState = matchState();

  const forcedResult = MatchActionReducer.reduce(forcedState, MatchCommand.ForcedError(true));
  const unforcedResult = MatchActionReducer.reduce(unforcedState, MatchCommand.UnforcedError(false));

  assert.equal(forcedState.player1Stats.forcedErrors, 1);
  assert.equal(forcedResult.pointWinner, false);
  assert.equal(unforcedState.player2Stats.unforcedErrors, 1);
  assert.equal(unforcedResult.pointWinner, true);
});

test('basicWinRecordsWinnerAndServeIn', () => {
  const state = matchState();
  state.isPlayer1Serving = false;
  state.isFirstServe = true;

  const result = MatchActionReducer.reduce(state, MatchCommand.BasicWin(true));

  assert.equal(state.player1Stats.winners, 1);
  assert.equal(state.player2Stats.firstServesIn, 1);
  assert.equal(state.player2Stats.firstServesTotal, 1);
  assert.equal(state.isFirstServe, true);
  assert.equal(result.pointWinner, true);
});

test('basicFaultUsesSameScoringAsFault', () => {
  const state = matchState();
  state.isPlayer1Serving = true;
  state.isFirstServe = true;

  const result = MatchActionReducer.reduce(state, MatchCommand.BasicFault);

  assert.equal(state.player1Stats.firstServesTotal, 1);
  assert.equal(state.isFirstServe, false);
  assert.equal(result.pointWinner, null);
});

test('toggleSidesCommandFlipsSidesWithoutUiMutation', () => {
  const state = matchState();
  state.sidesSwapped = false;

  MatchActionReducer.reduce(state, MatchCommand.ToggleSides);
  assert.equal(state.sidesSwapped, true);

  MatchActionReducer.reduce(state, MatchCommand.ToggleSides);
  assert.equal(state.sidesSwapped, false);
});

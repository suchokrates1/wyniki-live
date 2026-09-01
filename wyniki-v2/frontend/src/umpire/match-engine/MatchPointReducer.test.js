import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchPointEvent, MatchPointReducer } from './matchPointReducer.js';
import { matchState } from './testSupport.js';

test('regularPointOnlyIncrementsWinnerAndLogsPointEvent', () => {
  const state = matchState();

  const result = MatchPointReducer.addPoint(state, true);

  assert.equal(state.player1Points, 1);
  assert.equal(state.player2Points, 0);
  assert.deepEqual(result.events, [MatchPointEvent.Point]);
  assert.equal(result.announcementType, null);
  assert.equal(result.showAnnouncementImmediately, false);
});

test('singlesTiebreakChangesServerAfterOddTotalPoints', () => {
  const state = matchState();
  state.isTiebreak = true;
  state.isPlayer1Serving = true;

  const result = MatchPointReducer.addPoint(state, false);

  assert.equal(state.player1Points, 0);
  assert.equal(state.player2Points, 1);
  assert.equal(state.isPlayer1Serving, false);
  assert.deepEqual(result.events, [MatchPointEvent.Point, MatchPointEvent.ServeChange]);
});

test('doublesTiebreakRotatesCurrentServerAfterOddTotalPoints', () => {
  const state = matchState({ isDoubles: true });
  state.isTiebreak = true;
  state.currentServer = 1;
  state.isPlayer1Serving = true;

  const result = MatchPointReducer.addPoint(state, false);

  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);
  assert.deepEqual(result.events, [MatchPointEvent.Point, MatchPointEvent.ServeChange]);
});

test('tiebreakChangesSidesEverySixPointsWhenGameContinues', () => {
  const state = matchState();
  state.isTiebreak = true;
  state.player1Points = 3;
  state.player2Points = 2;
  state.sidesSwapped = false;

  const result = MatchPointReducer.addPoint(state, false);

  assert.equal(state.player1Points, 3);
  assert.equal(state.player2Points, 3);
  assert.equal(state.sidesSwapped, true);
  assert.deepEqual(result.events, [MatchPointEvent.Point, MatchPointEvent.SideChange]);
  assert.equal(result.announcementType, MatchPointReducer.ANNOUNCEMENT_SIDE_CHANGE);
  assert.equal(result.showAnnouncementImmediately, true);
});

test('tiebreakDoesNotChangeSidesWhenPointEndsTheGame', () => {
  const state = matchState();
  state.isTiebreak = true;
  state.player1Points = 6;
  state.player2Points = 5;
  state.sidesSwapped = false;

  const result = MatchPointReducer.addPoint(state, true);

  assert.equal(state.player1Points, 7);
  assert.equal(state.player2Points, 5);
  assert.equal(state.sidesSwapped, false);
  assert.deepEqual(result.events, [MatchPointEvent.Point]);
  assert.equal(result.announcementType, null);
  assert.equal(result.showAnnouncementImmediately, false);
});

test('tiebreakWinningPointDoesNotChangeServer', () => {
  const state = matchState();
  state.isTiebreak = true;
  state.isPlayer1Serving = false;
  state.player1Points = 6;
  state.player2Points = 4;

  const result = MatchPointReducer.addPoint(state, true);

  assert.equal(state.player1Points, 7);
  assert.equal(state.player2Points, 4);
  assert.equal(state.isPlayer1Serving, false);
  assert.deepEqual(result.events, [MatchPointEvent.Point]);
});

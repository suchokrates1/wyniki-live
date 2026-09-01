import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionType } from './models.js';
import { MatchUndoManager, MatchUndoResult } from './matchUndoManager.js';
import { matchState } from './testSupport.js';

test('savesSnapshotAndRestoresLastAction', () => {
  const state = matchState();
  state.player1Points = 2;
  state.player2Points = 1;
  state.player1Stats.aces = 1;

  MatchUndoManager.saveStateBeforeAction(state, ActionType.ACE, 'Ace Jan');
  state.player1Points = 3;
  state.player2Points = 2;
  state.player1Stats.aces = 2;

  const result = MatchUndoManager.undoLastAction(state);

  assert.equal(state.player1Points, 2);
  assert.equal(state.player2Points, 1);
  assert.equal(state.player1Stats.aces, 1);
  assert.equal(result.type, 'Restored');
  assert.equal(result.description, 'Ace Jan');
  assert.equal(result.canUndo, false);
});

test('trimsOldestSnapshotsWhenHistoryLimitIsExceeded', () => {
  const state = matchState();

  MatchUndoManager.saveStateBeforeAction(state, ActionType.ACE, 'first', 2);
  MatchUndoManager.saveStateBeforeAction(state, ActionType.WINNER, 'second', 2);
  MatchUndoManager.saveStateBeforeAction(state, ActionType.FAULT, 'third', 2);

  assert.equal(state.actionsHistory.length, 2);
  assert.equal(state.actionsHistory[0].description, 'second');
  assert.equal(state.actionsHistory[1].description, 'third');
});

test('returnsNoActionWhenHistoryIsEmpty', () => {
  const result = MatchUndoManager.undoLastAction(matchState());
  assert.equal(result, MatchUndoResult.NoAction);
});

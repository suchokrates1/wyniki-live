import { MatchActionReducer, MatchCommand } from './matchActionReducer.js';
import { MatchProgressReducer } from './matchProgressReducer.js';
import { MatchUndoManager } from './matchUndoManager.js';
import { ActionType } from './models.js';

export function scorePoint(state, isPlayer1, nowMs = 9_000, { saveUndo = false } = {}) {
  if (saveUndo) {
    MatchUndoManager.saveStateBeforeAction(state, ActionType.WINNER, isPlayer1 ? 'P1' : 'P2');
  }
  const scored = MatchActionReducer.reduce(state, MatchCommand.PointWon(isPlayer1));
  return MatchProgressReducer.reduceAfterPoint(state, scored.announcementType, nowMs);
}

export function scoreBasicPoint(state, isPlayer1, nowMs = 9_000) {
  const action = MatchActionReducer.reduce(state, MatchCommand.BasicWin(isPlayer1));
  if (action.pointWinner == null) return action;
  return scorePoint(state, action.pointWinner, nowMs);
}

export function playStraightGame(state, isPlayer1, nowMs = 9_000) {
  let result;
  for (let i = 0; i < 4; i += 1) {
    result = scorePoint(state, isPlayer1, nowMs);
  }
  return result;
}

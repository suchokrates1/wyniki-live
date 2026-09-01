import { MatchAction } from './models.js';
import { MatchUndoRestorer } from './matchUndoRestorer.js';

const DEFAULT_MAX_HISTORY = 100;

export const MatchUndoResult = Object.freeze({
  NoAction: Object.freeze({ type: 'NoAction' }),
  Restored(description, canUndo) {
    return { type: 'Restored', description, canUndo };
  },
});

export const MatchUndoManager = {
  saveStateBeforeAction(state, actionType, description, maxHistory = DEFAULT_MAX_HISTORY) {
    const action = new MatchAction({
      actionType,
      previousPlayer1Points: state.player1Points,
      previousPlayer2Points: state.player2Points,
      previousPlayer1Games: state.player1Games,
      previousPlayer2Games: state.player2Games,
      previousPlayer1Sets: state.player1Sets,
      previousPlayer2Sets: state.player2Sets,
      previousIsPlayer1Serving: state.isPlayer1Serving,
      previousIsFirstServe: state.isFirstServe,
      previousIsTiebreak: state.isTiebreak,
      previousIsSuperTiebreak: state.isSuperTiebreak,
      previousSetsHistorySize: state.setsHistory.length,
      previousSidesSwapped: state.sidesSwapped,
      previousTotalGamesPlayed: state.totalGamesPlayed,
      previousCurrentServer: state.currentServer,
      previousTiebreakOpeningServer: state.tiebreakOpeningServer,
      previousIsMatchFinished: state.isMatchFinished,
      previousPlayer1Stats: state.player1Stats.copy(),
      previousPlayer2Stats: state.player2Stats.copy(),
      description,
    });

    state.actionsHistory.push(action);
    while (state.actionsHistory.length > maxHistory) {
      state.actionsHistory.shift();
    }
  },

  undoLastAction(state) {
    if (state.actionsHistory.length === 0) {
      return MatchUndoResult.NoAction;
    }

    const lastAction = state.actionsHistory.pop();
    MatchUndoRestorer.restore(state, lastAction);
    return MatchUndoResult.Restored(lastAction.description, state.actionsHistory.length > 0);
  },
};

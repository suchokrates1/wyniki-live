import { DoublesServeRotation } from './doublesServeRotation.js';
import { TiebreakServeRule } from './tiebreakServeRule.js';

export const MatchStartReducer = {
  start(state, serverNumber, nowMs) {
    state.currentServer = state.isDoubles
      ? coerceIn(serverNumber, 1, 4)
      : (serverNumber === 2 ? 2 : 1);
    state.isPlayer1Serving = state.isDoubles
      ? DoublesServeRotation.isTeamOneServing(state.currentServer)
      : state.currentServer === 1;
    if (state.isTiebreak || state.isSuperTiebreak) {
      TiebreakServeRule.captureOpeningServer(state);
    }
    state.matchStartTime = state.manualStartTime ?? nowMs;
  },
};

function coerceIn(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

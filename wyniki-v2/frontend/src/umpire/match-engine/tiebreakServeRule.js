import { DoublesServeRotation } from './doublesServeRotation.js';

/**
 * ITF Rules of Tennis, tie-break order of service:
 * the player/team that served the first point of the tie-break receives
 * in the first game of the following set (or match tie-break).
 */
export const TiebreakServeRule = {
  captureOpeningServer(state) {
    state.tiebreakOpeningServer = currentServerSlot(state);
  },

  assignFirstGameOfNextSet(state) {
    const opening = state.tiebreakOpeningServer;
    if (state.isDoubles) {
      state.currentServer = DoublesServeRotation.nextServer(opening);
      state.isPlayer1Serving = DoublesServeRotation.isTeamOneServing(state.currentServer);
    } else {
      state.isPlayer1Serving = opening !== 1;
      state.currentServer = state.isPlayer1Serving ? 1 : 2;
    }
  },

  rotate(state) {
    if (state.isDoubles) {
      DoublesServeRotation.rotate(state);
    } else {
      state.isPlayer1Serving = !state.isPlayer1Serving;
      state.currentServer = state.isPlayer1Serving ? 1 : 2;
    }
  },
};

function currentServerSlot(state) {
  if (state.isDoubles) return state.currentServer;
  return state.isPlayer1Serving ? 1 : 2;
}

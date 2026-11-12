import { MatchFinishReason } from './models.js';

export const MatchFinishOutcomeApplier = {
  apply(state, request, nowMs) {
    state.finishReason = request.finishReason;
    state.finishWinnerName = request.winnerName ?? null;
    state.injuredPlayerName = request.injuredPlayerName ?? null;
    state.resultNote = request.resultNote ?? null;

    if (request.finishReason === MatchFinishReason.WALKOVER) {
      applyWalkoverScore(state, request.winnerName);
    }

    state.isMatchFinished = true;
    state.matchDuration = state.matchStartTime > 0
      ? nowMs - state.matchStartTime
      : state.matchDuration;
  },
};

// A walkover is a win with no score: nothing was played, so there are no sets and no games.
// The server stores it the same way; the winner is the name the umpire picked (finishWinnerName).
function applyWalkoverScore(state, winnerName) {
  if (winnerName !== state.getTeam1FullName() && winnerName !== state.getTeam2FullName()) return;

  state.player1Sets = 0;
  state.player2Sets = 0;
  state.player1Games = 0;
  state.player2Games = 0;
  state.player1Points = 0;
  state.player2Points = 0;
  state.isTiebreak = false;
  state.isSuperTiebreak = false;
  state.setsHistory.length = 0;
}

import { MatchFinishReason, SetScore } from './models.js';

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

function applyWalkoverScore(state, winnerName) {
  const teamOneName = state.getTeam1FullName();
  const teamTwoName = state.getTeam2FullName();
  const playerOneWins = winnerName === teamOneName;
  const playerTwoWins = winnerName === teamTwoName;
  if (!playerOneWins && !playerTwoWins) return;

  state.player1Sets = playerOneWins ? 2 : 0;
  state.player2Sets = playerTwoWins ? 2 : 0;
  state.player1Games = 0;
  state.player2Games = 0;
  state.player1Points = 0;
  state.player2Points = 0;
  state.isTiebreak = false;
  state.isSuperTiebreak = false;
  state.setsHistory.length = 0;
  state.setsHistory.push(new SetScore({
    setNumber: 1,
    player1Games: playerOneWins ? 4 : 0,
    player2Games: playerTwoWins ? 4 : 0,
  }));
  state.setsHistory.push(new SetScore({
    setNumber: 2,
    player1Games: playerOneWins ? 4 : 0,
    player2Games: playerTwoWins ? 4 : 0,
  }));
}

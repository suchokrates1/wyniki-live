import { MatchAction, MatchConfig, MatchState, MatchStatistics, SetScore } from '../match-engine/models.js';
import { playerFromDraft } from './createMatchFromDraft.js';

export function serializeMatchState(state) {
  return {
    matchId: state.matchId,
    clientMatchUuid: state.clientMatchUuid,
    player1: serializePlayer(state.player1),
    player2: serializePlayer(state.player2),
    player3: state.player3 ? serializePlayer(state.player3) : null,
    player4: state.player4 ? serializePlayer(state.player4) : null,
    courtId: state.courtId,
    courtName: state.courtName,
    scheduleId: state.scheduleId,
    isDoubles: state.isDoubles,
    isMixedDoubles: state.isMixedDoubles,
    team1Name: state.team1Name,
    team2Name: state.team2Name,
    umpireName: state.umpireName,
    manualStartTime: state.manualStartTime,
    currentServer: state.currentServer,
    noAdvantage: state.noAdvantage,
    matchConfig: { ...state.matchConfig },
    player1Sets: state.player1Sets,
    player2Sets: state.player2Sets,
    player1Games: state.player1Games,
    player2Games: state.player2Games,
    player1Points: state.player1Points,
    player2Points: state.player2Points,
    setsHistory: state.setsHistory.map((set) => ({ ...set })),
    isPlayer1Serving: state.isPlayer1Serving,
    isFirstServe: state.isFirstServe,
    isTiebreak: state.isTiebreak,
    isSuperTiebreak: state.isSuperTiebreak,
    isMatchFinished: state.isMatchFinished,
    sidesSwapped: state.sidesSwapped,
    totalGamesPlayed: state.totalGamesPlayed,
    tiebreakOpeningServer: state.tiebreakOpeningServer,
    matchStartTime: state.matchStartTime,
    matchDuration: state.matchDuration,
    player1Stats: { ...state.player1Stats },
    player2Stats: { ...state.player2Stats },
    statsMode: state.statsMode,
    actionsHistory: state.actionsHistory.map(serializeAction),
    finishReason: state.finishReason,
    finishWinnerName: state.finishWinnerName,
    injuredPlayerName: state.injuredPlayerName,
    resultNote: state.resultNote,
  };
}

export function hydrateMatchState(raw) {
  if (!raw) return null;
  return new MatchState({
    ...raw,
    player1: playerFromDraft(raw.player1),
    player2: playerFromDraft(raw.player2),
    player3: raw.player3 ? playerFromDraft(raw.player3) : null,
    player4: raw.player4 ? playerFromDraft(raw.player4) : null,
    matchConfig: new MatchConfig(raw.matchConfig),
    setsHistory: (raw.setsHistory || []).map((set) => new SetScore(set)),
    player1Stats: new MatchStatistics(raw.player1Stats),
    player2Stats: new MatchStatistics(raw.player2Stats),
    actionsHistory: (raw.actionsHistory || []).map(hydrateAction),
  });
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    firstName: player.firstName,
    lastName: player.lastName,
    flag: player.flag,
    gender: player.gender,
  };
}

function serializeAction(action) {
  return {
    ...action,
    previousPlayer1Stats: { ...action.previousPlayer1Stats },
    previousPlayer2Stats: { ...action.previousPlayer2Stats },
  };
}

function hydrateAction(raw) {
  return new MatchAction({
    ...raw,
    previousPlayer1Stats: new MatchStatistics(raw.previousPlayer1Stats),
    previousPlayer2Stats: new MatchStatistics(raw.previousPlayer2Stats),
  });
}

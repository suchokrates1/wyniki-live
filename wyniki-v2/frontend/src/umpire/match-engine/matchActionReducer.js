import { MatchStartReducer } from './matchStartReducer.js';
import { MatchPointReducer } from './matchPointReducer.js';

export const MatchCommand = Object.freeze({
  StartMatch: (serverNumber, nowMs) => ({ type: 'StartMatch', serverNumber, nowMs }),
  Ace: Object.freeze({ type: 'Ace' }),
  Fault: Object.freeze({ type: 'Fault' }),
  FootFault: Object.freeze({ type: 'FootFault' }),
  BallInPlay: Object.freeze({ type: 'BallInPlay' }),
  PointWon: (isPlayer1) => ({ type: 'PointWon', isPlayer1 }),
  Winner: (isPlayer1) => ({ type: 'Winner', isPlayer1 }),
  ForcedError: (isPlayer1) => ({ type: 'ForcedError', isPlayer1 }),
  UnforcedError: (isPlayer1) => ({ type: 'UnforcedError', isPlayer1 }),
  BasicWin: (isPlayer1) => ({ type: 'BasicWin', isPlayer1 }),
  BasicFault: Object.freeze({ type: 'BasicFault' }),
  ToggleSides: Object.freeze({ type: 'ToggleSides' }),
});

export const MatchActionReducer = {
  reduce(state, command) {
    switch (command.type) {
      case 'StartMatch':
        return startMatch(state, command.serverNumber, command.nowMs);
      case 'Ace':
        return ace(state);
      case 'Fault':
      case 'FootFault':
      case 'BasicFault':
        return fault(state);
      case 'BallInPlay':
        return ballInPlay(state);
      case 'PointWon':
        return pointWon(state, command.isPlayer1);
      case 'Winner':
        return winner(state, command.isPlayer1);
      case 'ForcedError':
        return forcedError(state, command.isPlayer1);
      case 'UnforcedError':
        return unforcedError(state, command.isPlayer1);
      case 'BasicWin':
        return basicWin(state, command.isPlayer1);
      case 'ToggleSides':
        return toggleSides(state);
      default:
        throw new Error(`Unknown match command: ${command.type}`);
    }
  },
};

function emptyResult(overrides = {}) {
  return {
    pointWinner: null,
    transitionToRally: false,
    pointScored: false,
    pointEvents: [],
    announcementType: null,
    showAnnouncementImmediately: false,
    ...overrides,
  };
}

function startMatch(state, serverNumber, nowMs) {
  MatchStartReducer.start(state, serverNumber, nowMs);
  return emptyResult();
}

function ace(state) {
  const stats = servingStats(state);
  stats.aces += 1;
  stats.firstServesIn += 1;
  stats.firstServesTotal += 1;
  const pointWinner = state.isPlayer1Serving;
  state.isFirstServe = true;
  return emptyResult({ pointWinner });
}

function fault(state) {
  const stats = servingStats(state);
  if (state.isFirstServe) {
    stats.firstServesTotal += 1;
    state.isFirstServe = false;
    return emptyResult();
  }

  stats.doubleFaults += 1;
  stats.secondServesTotal += 1;
  const pointWinner = !state.isPlayer1Serving;
  state.isFirstServe = true;
  return emptyResult({ pointWinner });
}

function ballInPlay(state) {
  recordServeIn(state);
  state.isFirstServe = true;
  return emptyResult({ transitionToRally: true });
}

function pointWon(state, isPlayer1) {
  const result = MatchPointReducer.addPoint(state, isPlayer1);
  return emptyResult({
    pointScored: true,
    pointEvents: result.events,
    announcementType: result.announcementType,
    showAnnouncementImmediately: result.showAnnouncementImmediately,
  });
}

function winner(state, isPlayer1) {
  playerStats(state, isPlayer1).winners += 1;
  return emptyResult({ pointWinner: isPlayer1 });
}

function forcedError(state, isPlayer1) {
  playerStats(state, isPlayer1).forcedErrors += 1;
  return emptyResult({ pointWinner: !isPlayer1 });
}

function unforcedError(state, isPlayer1) {
  playerStats(state, isPlayer1).unforcedErrors += 1;
  return emptyResult({ pointWinner: !isPlayer1 });
}

function basicWin(state, isPlayer1) {
  playerStats(state, isPlayer1).winners += 1;
  recordServeIn(state);
  state.isFirstServe = true;
  return emptyResult({ pointWinner: isPlayer1 });
}

function toggleSides(state) {
  state.sidesSwapped = !state.sidesSwapped;
  return emptyResult();
}

function recordServeIn(state) {
  const stats = servingStats(state);
  if (state.isFirstServe) {
    stats.firstServesIn += 1;
    stats.firstServesTotal += 1;
  } else {
    stats.secondServesIn += 1;
    stats.secondServesTotal += 1;
  }
}

function servingStats(state) {
  return playerStats(state, state.isPlayer1Serving);
}

function playerStats(state, isPlayer1) {
  return isPlayer1 ? state.player1Stats : state.player2Stats;
}

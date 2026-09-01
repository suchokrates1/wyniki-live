import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchActionReducer, MatchCommand } from './matchActionReducer.js';
import { MatchFinishOutcomeApplier } from './matchFinishOutcomeApplier.js';
import { MatchPointReducer } from './matchPointReducer.js';
import { MatchProgressReducer, MatchProgressScreen } from './matchProgressReducer.js';
import { MatchStartReducer } from './matchStartReducer.js';
import { MatchUndoManager } from './matchUndoManager.js';
import { DoublesServeRotation } from './doublesServeRotation.js';
import {
  FinishMatchRequest,
  MatchConfig,
  MatchFinishReason,
} from './models.js';
import { playStraightGame, scoreBasicPoint, scorePoint } from './playPoint.js';
import { matchState } from './testSupport.js';

test('G1 ADV deuce then gem then set then match 2-0 Basic', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 4, setsToWin: 2 }) });
  MatchStartReducer.start(state, 1, 1_000);

  for (const winner of [true, false, true, false, true, false]) {
    scoreBasicPoint(state, winner);
  }
  assert.equal(state.player1Points, 3);
  assert.equal(state.player2Points, 3);
  assert.equal(state.getPlayer1PointsDisplay(), '40');
  assert.equal(state.getPlayer2PointsDisplay(), '40');

  scoreBasicPoint(state, true);
  assert.equal(state.isGameWon(), false);
  assert.equal(state.getPlayer1PointsDisplay(), 'ADV');

  scoreBasicPoint(state, true);
  assert.equal(state.player1Games, 1);
  assert.equal(state.player1Points, 0);

  for (let game = 0; game < 3; game += 1) playStraightGame(state, true);
  assert.equal(state.player1Sets, 1);
  assert.equal(state.player1Games, 0);

  for (let game = 0; game < 4; game += 1) playStraightGame(state, true);
  assert.equal(state.player1Sets, 2);
  assert.equal(state.isMatchFinished, true);
  assert.equal(state.player2Sets, 0);
});

test('G2 no-ad deciding point announcement then next point wins game', () => {
  const state = matchState({
    noAdvantage: true,
    matchConfig: new MatchConfig({ noAdvantage: true }),
  });
  state.player1Points = 3;
  state.player2Points = 3;

  const deciding = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);
  assert.equal(deciding.announcementType, MatchProgressReducer.ANNOUNCEMENT_DECIDING_POINT);
  assert.equal(deciding.nextScreen, MatchProgressScreen.Announcement);
  assert.equal(deciding.syncMatch, false);

  const result = scorePoint(state, true);
  assert.equal(state.player1Games, 1);
  assert.equal(state.player1Points, 0);
  assert.equal(result.publishState, true);
});

test('G3 tiebreak to 7 win-by-2 and serve change', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }) });
  state.isPlayer1Serving = true;
  state.currentServer = 1;
  state.player1Games = 5;
  state.player2Games = 6;
  state.player1Points = 4;
  state.player2Points = 0;

  MatchProgressReducer.reduceAfterPoint(state, null, 9_000);
  assert.equal(state.isTiebreak, true);
  assert.equal(state.isPlayer1Serving, false);

  const first = MatchPointReducer.addPoint(state, true);
  assert.equal(first.events.includes('ServeChange'), true);
  assert.equal(state.isPlayer1Serving, true);

  state.player1Points = 7;
  state.player2Points = 6;
  assert.equal(state.isGameWon(), false);

  state.player1Points = 8;
  assert.equal(state.isGameWon(), true);
  const closed = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);
  assert.equal(state.isTiebreak, false);
  assert.equal(state.player1Sets, 1);
  assert.equal(closed.publishState, true);
});

test('G4 super tiebreak starts at one set all', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }) });
  state.player1Sets = 0;
  state.player2Sets = 1;
  state.player1Games = 5;
  state.player2Games = 4;
  state.player1Points = 4;
  state.player2Points = 0;

  const result = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);
  assert.equal(state.player1Sets, 1);
  assert.equal(state.player2Sets, 1);
  assert.equal(state.isSuperTiebreak, true);
  assert.equal(result.announcementType, MatchProgressReducer.ANNOUNCEMENT_SUPER_TIEBREAK);

  state.player1Points = 10;
  state.player2Points = 8;
  assert.equal(state.isGameWon(), true);
  MatchProgressReducer.reduceAfterPoint(state, null, 9_000);
  assert.equal(state.isMatchFinished, true);
  assert.equal(state.player1Sets, 2);
});

test('G5 Advanced ace fault DF BIP winner FE UE', () => {
  const state = matchState();
  state.isPlayer1Serving = true;
  state.isFirstServe = true;

  const ace = MatchActionReducer.reduce(state, MatchCommand.Ace);
  assert.equal(state.player1Stats.aces, 1);
  assert.equal(ace.pointWinner, true);

  const firstFault = MatchActionReducer.reduce(state, MatchCommand.Fault);
  assert.equal(state.isFirstServe, false);
  assert.equal(firstFault.pointWinner, null);

  const doubleFault = MatchActionReducer.reduce(state, MatchCommand.Fault);
  assert.equal(state.player1Stats.doubleFaults, 1);
  assert.equal(doubleFault.pointWinner, false);

  state.isFirstServe = false;
  const bip = MatchActionReducer.reduce(state, MatchCommand.BallInPlay);
  assert.equal(bip.transitionToRally, true);
  assert.equal(state.player1Stats.secondServesIn, 1);

  const winner = MatchActionReducer.reduce(state, MatchCommand.Winner(true));
  assert.equal(state.player1Stats.winners, 1);
  assert.equal(winner.pointWinner, true);

  const forced = MatchActionReducer.reduce(state, MatchCommand.ForcedError(false));
  assert.equal(state.player2Stats.forcedErrors, 1);
  assert.equal(forced.pointWinner, true);

  const unforced = MatchActionReducer.reduce(state, MatchCommand.UnforcedError(true));
  assert.equal(state.player1Stats.unforcedErrors, 1);
  assert.equal(unforced.pointWinner, false);
});

test('G6 doubles four-slot serve rotation', () => {
  const state = matchState({ isDoubles: true });
  MatchStartReducer.start(state, 1, 1_000);
  assert.equal(state.currentServer, 1);
  assert.equal(state.isPlayer1Serving, true);

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 3);
  assert.equal(state.isPlayer1Serving, true);

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 4);
  assert.equal(state.isPlayer1Serving, false);

  playStraightGame(state, true);
  assert.equal(state.currentServer, 1);
  assert.equal(state.isPlayer1Serving, true);
});

test('G7 undo three times mid-game then finish the game', () => {
  const state = matchState();
  scorePoint(state, true, 9_000, { saveUndo: true });
  scorePoint(state, false, 9_000, { saveUndo: true });
  scorePoint(state, true, 9_000, { saveUndo: true });
  assert.equal(state.player1Points, 2);
  assert.equal(state.player2Points, 1);

  MatchUndoManager.undoLastAction(state);
  MatchUndoManager.undoLastAction(state);
  const last = MatchUndoManager.undoLastAction(state);
  assert.equal(state.player1Points, 0);
  assert.equal(state.player2Points, 0);
  assert.equal(last.canUndo, false);

  playStraightGame(state, true);
  assert.equal(state.player1Games, 1);
  assert.equal(state.player1Points, 0);
});

test('G8 finish Normal Test Retirement Walkover', () => {
  const normal = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 4, setsToWin: 2 }) });
  normal.matchStartTime = 1_000;
  normal.player1Sets = 1;
  normal.player1Games = 3;
  normal.player2Games = 1;
  normal.player1Points = 4;
  const finished = MatchProgressReducer.reduceAfterPoint(normal, null, 9_000);
  assert.equal(normal.isMatchFinished, true);
  assert.equal(normal.finishReason, MatchFinishReason.NORMAL);
  assert.equal(finished.finalizeMatch, true);

  const testFinish = matchState();
  testFinish.player1Games = 1;
  MatchFinishOutcomeApplier.apply(
    testFinish,
    new FinishMatchRequest({ finishReason: MatchFinishReason.TEST }),
    5_000,
  );
  assert.equal(testFinish.finishReason, MatchFinishReason.TEST);
  assert.equal(testFinish.player1Games, 1);

  const retirement = matchState();
  retirement.player1Sets = 1;
  retirement.player1Games = 2;
  MatchFinishOutcomeApplier.apply(
    retirement,
    new FinishMatchRequest({
      finishReason: MatchFinishReason.RETIREMENT,
      winnerName: 'Jan Kowalski',
      injuredPlayerName: 'Adam Nowak',
    }),
    5_000,
  );
  assert.equal(retirement.player1Sets, 1);
  assert.equal(retirement.player1Games, 2);

  const walkover = matchState();
  MatchFinishOutcomeApplier.apply(
    walkover,
    new FinishMatchRequest({
      finishReason: MatchFinishReason.WALKOVER,
      winnerName: 'Jan Kowalski',
    }),
    5_000,
  );
  assert.equal(walkover.player1Sets, 2);
  assert.equal(walkover.player2Sets, 0);
  assert.equal(walkover.setsHistory.length, 2);
});

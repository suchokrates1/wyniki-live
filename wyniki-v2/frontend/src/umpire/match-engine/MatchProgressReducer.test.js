import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig } from './models.js';
import { MatchPointReducer } from './matchPointReducer.js';
import {
  MatchProgressEvent,
  MatchProgressReducer,
  MatchProgressScreen,
} from './matchProgressReducer.js';
import { matchState } from './testSupport.js';

test('normalGameAddsGameResetsPointsChangesServerAndRequestsSync', () => {
  const state = matchState();
  state.matchStartTime = 1_000;
  state.isPlayer1Serving = true;
  state.player1Points = 4;
  state.player2Points = 1;

  const result = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);

  assert.equal(state.player1Games, 1);
  assert.equal(state.player1Points, 0);
  assert.equal(state.player2Points, 0);
  assert.equal(state.isPlayer1Serving, false);
  assert.equal(state.sidesSwapped, true);
  assert.equal(result.announcementType, MatchProgressReducer.ANNOUNCEMENT_SIDE_CHANGE);
  assert.equal(result.nextScreen, MatchProgressScreen.Announcement);
  assert.deepEqual(result.events, [MatchProgressEvent.Game]);
  assert.equal(result.publishState, true);
  assert.equal(result.syncMatch, true);
  assert.equal(result.finalizeMatch, false);
});

test('noAdvantageDeuceShowsDecidingPointWithoutSync', () => {
  const state = matchState({ noAdvantage: true });
  state.player1Points = 3;
  state.player2Points = 3;

  const result = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);

  assert.equal(result.announcementType, MatchProgressReducer.ANNOUNCEMENT_DECIDING_POINT);
  assert.equal(result.nextScreen, MatchProgressScreen.Announcement);
  assert.equal(result.publishState, true);
  assert.equal(result.syncMatch, false);
  assert.equal(result.finalizeMatch, false);
});

test('setWinAddsSetHistoryAndStartsNextSet', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }) });
  state.isPlayer1Serving = true;
  state.player1Games = 5;
  state.player2Games = 4;
  state.player1Points = 4;
  state.player2Points = 0;

  const result = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);

  assert.equal(state.player1Sets, 1);
  assert.equal(state.player2Sets, 0);
  assert.equal(state.player1Games, 0);
  assert.equal(state.player2Games, 0);
  assert.equal(state.setsHistory.length, 1);
  assert.equal(state.setsHistory[0].player1Games, 6);
  assert.equal(state.setsHistory[0].player2Games, 4);
  assert.deepEqual(result.events, [MatchProgressEvent.Game, MatchProgressEvent.Set]);
  assert.equal(result.syncMatch, true);
  assert.equal(result.finalizeMatch, false);
});

test('gameAtTiebreakBoundaryStartsTiebreakAnnouncement', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }) });
  state.player1Games = 5;
  state.player2Games = 6;
  state.player1Points = 4;
  state.player2Points = 0;

  const result = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);

  assert.equal(state.isTiebreak, true);
  assert.equal(state.player1Games, 6);
  assert.equal(state.player2Games, 6);
  assert.equal(state.tiebreakOpeningServer, 2);
  assert.equal(state.isPlayer1Serving, false);
  assert.equal(result.announcementType, MatchProgressReducer.ANNOUNCEMENT_TIEBREAK);
  assert.equal(result.nextScreen, MatchProgressScreen.Announcement);
});

test('splitSetsStartSuperTiebreak', () => {
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
  assert.equal(state.tiebreakOpeningServer, 2);
  assert.equal(state.isPlayer1Serving, false);
  assert.equal(result.announcementType, MatchProgressReducer.ANNOUNCEMENT_SUPER_TIEBREAK);
  assert.equal(result.nextScreen, MatchProgressScreen.Announcement);
});

test('matchWinMarksFinishedAndRequestsFinalizeWithoutSync', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }) });
  state.matchStartTime = 1_000;
  state.player1Sets = 1;
  state.player2Sets = 0;
  state.player1Games = 5;
  state.player2Games = 4;
  state.player1Points = 4;
  state.player2Points = 0;

  const result = MatchProgressReducer.reduceAfterPoint(state, null, 9_000);

  assert.equal(state.isMatchFinished, true);
  assert.equal(state.matchDuration, 8_000);
  assert.equal(state.player1Sets, 2);
  assert.equal(state.player1Games, 6);
  assert.equal(state.player2Games, 4);
  assert.equal(result.nextScreen, MatchProgressScreen.MatchFinished);
  assert.deepEqual(result.events, [MatchProgressEvent.Game, MatchProgressEvent.Set]);
  assert.equal(result.publishState, true);
  assert.equal(result.syncMatch, false);
  assert.equal(result.finalizeMatch, true);
});

test('afterSetTiebreakOpeningServerReceivesTheNextSet', () => {
  const state = startSetTiebreak(true);
  playTiebreak(state, [true, false, true, false, true, false, true, true, true, true]);

  assert.equal(state.player1Sets, 1);
  assert.equal(state.player2Sets, 0);
  assert.equal(state.isTiebreak, false);
  assert.equal(state.isPlayer1Serving, false);
  assert.equal(state.currentServer, 2);
});

test('afterSetTiebreakPlayerTwoOpeningServerReceivesTheNextSet', () => {
  const state = startSetTiebreak(false);
  playTiebreak(state, [false, true, false, true, false, true, false, false, false, false]);

  assert.equal(state.player1Sets, 0);
  assert.equal(state.player2Sets, 1);
  assert.equal(state.isPlayer1Serving, true);
  assert.equal(state.currentServer, 1);
});

test('afterSetTiebreakAtSevenFourOpeningServerStillReceives', () => {
  const state = startSetTiebreak(true);
  playTiebreak(state, [true, false, true, false, true, false, true, false, true, true, true]);

  assert.equal(state.isPlayer1Serving, false);
  assert.equal(state.currentServer, 2);
});

test('doublesAfterSetTiebreakNextServerIsPartnerOfOpeningTeamOpponent', () => {
  const state = startSetTiebreak(true, true);
  state.currentServer = 1;
  state.tiebreakOpeningServer = 1;

  playTiebreak(state, [true, false, true, false, true, false, true, true, true, true]);

  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);
});

function startSetTiebreak(player1Opens, isDoubles = false) {
  const state = matchState({
    matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }),
    isDoubles,
  });
  state.isTiebreak = true;
  state.isPlayer1Serving = player1Opens;
  state.currentServer = player1Opens ? 1 : 2;
  state.tiebreakOpeningServer = state.currentServer;
  state.player1Games = 6;
  state.player2Games = 6;
  return state;
}

function playTiebreak(state, pointWinnersArePlayer1) {
  for (const player1Won of pointWinnersArePlayer1) {
    MatchPointReducer.addPoint(state, player1Won);
    MatchProgressReducer.reduceAfterPoint(state, null, 9_000);
  }
}

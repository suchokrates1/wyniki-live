import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionType, MatchAction, MatchStatistics, SetScore } from './models.js';
import { MatchUndoRestorer } from './matchUndoRestorer.js';
import { matchState } from './testSupport.js';

test('restoreRevertsScoreServeFlagsSetsHistoryAndStatistics', () => {
  const previousPlayer1Stats = new MatchStatistics({
    aces: 1,
    doubleFaults: 2,
    winners: 3,
    forcedErrors: 4,
    unforcedErrors: 5,
    firstServesIn: 6,
    firstServesTotal: 7,
    secondServesIn: 8,
    secondServesTotal: 9,
  });
  const previousPlayer2Stats = new MatchStatistics({
    aces: 9,
    doubleFaults: 8,
    winners: 7,
    forcedErrors: 6,
    unforcedErrors: 5,
    firstServesIn: 4,
    firstServesTotal: 3,
    secondServesIn: 2,
    secondServesTotal: 1,
  });
  const state = matchState();
  state.player1Points = 5;
  state.player2Points = 4;
  state.player1Games = 6;
  state.player2Games = 5;
  state.player1Sets = 1;
  state.player2Sets = 1;
  state.isPlayer1Serving = false;
  state.isFirstServe = true;
  state.isTiebreak = true;
  state.isSuperTiebreak = false;
  state.sidesSwapped = true;
  state.totalGamesPlayed = 11;
  state.currentServer = 4;
  state.isMatchFinished = true;
  state.setsHistory.push(new SetScore({ setNumber: 1, player1Games: 4, player2Games: 2 }));
  state.setsHistory.push(new SetScore({ setNumber: 2, player1Games: 2, player2Games: 4 }));
  state.player1Stats.aces = 99;
  state.player2Stats.doubleFaults = 99;

  const action = new MatchAction({
    actionType: ActionType.WINNER,
    previousPlayer1Points: 2,
    previousPlayer2Points: 3,
    previousPlayer1Games: 4,
    previousPlayer2Games: 3,
    previousPlayer1Sets: 1,
    previousPlayer2Sets: 0,
    previousIsPlayer1Serving: true,
    previousIsFirstServe: false,
    previousIsTiebreak: false,
    previousIsSuperTiebreak: true,
    previousSetsHistorySize: 1,
    previousSidesSwapped: false,
    previousTotalGamesPlayed: 7,
    previousCurrentServer: 3,
    previousIsMatchFinished: false,
    previousPlayer1Stats,
    previousPlayer2Stats,
    description: 'winner',
  });

  MatchUndoRestorer.restore(state, action);

  assert.equal(state.player1Points, 2);
  assert.equal(state.player2Points, 3);
  assert.equal(state.player1Games, 4);
  assert.equal(state.player2Games, 3);
  assert.equal(state.player1Sets, 1);
  assert.equal(state.player2Sets, 0);
  assert.equal(state.isPlayer1Serving, true);
  assert.equal(state.isFirstServe, false);
  assert.equal(state.isTiebreak, false);
  assert.equal(state.isSuperTiebreak, true);
  assert.equal(state.sidesSwapped, false);
  assert.equal(state.totalGamesPlayed, 7);
  assert.equal(state.currentServer, 3);
  assert.equal(state.isMatchFinished, false);
  assert.equal(state.setsHistory.length, 1);
  assert.equal(state.player1Stats.equals(previousPlayer1Stats), true);
  assert.equal(state.player2Stats.equals(previousPlayer2Stats), true);
});

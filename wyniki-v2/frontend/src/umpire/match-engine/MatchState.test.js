import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig } from './models.js';
import { matchState } from './testSupport.js';

test('classicGameEndsOnFourthPointWithTwoPointMargin', () => {
  const state = matchState();
  state.player1Points = 4;
  state.player2Points = 2;

  assert.equal(state.isGameWon(), true);

  state.player2Points = 3;
  assert.equal(state.isGameWon(), false);
});

test('normalGameRequiresTwoPointAdvantageAfterDeuce', () => {
  const state = matchState();
  state.player1Points = 4;
  state.player2Points = 3;

  assert.equal(state.isGameWon(), false);

  state.player1Points = 5;
  assert.equal(state.isGameWon(), true);
});

test('advantageDisplayOnlyMarksPlayerWithLeadAfterDeuce', () => {
  const state = matchState();
  state.player1Points = 4;
  state.player2Points = 3;

  assert.equal(state.getPlayer1PointsDisplay(), 'ADV');
  assert.equal(state.getPlayer2PointsDisplay(), '40');

  state.player2Points = 4;
  assert.equal(state.getPlayer1PointsDisplay(), '40');
  assert.equal(state.getPlayer2PointsDisplay(), '40');
});

test('noAdvantageGameEndsOnFourthPoint', () => {
  const state = matchState({ noAdvantage: true });
  state.player1Points = 4;
  state.player2Points = 3;

  assert.equal(state.isGameWon(), true);
  assert.equal(state.getPlayer1PointsDisplay(), '40');
  assert.equal(state.getPlayer2PointsDisplay(), '40');
});

test('standardSetRequiresTwoGameMarginBeforeTiebreak', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6 }) });
  state.player1Games = 6;
  state.player2Games = 5;

  assert.equal(state.isSetWon(), false);

  state.player1Games = 7;
  assert.equal(state.isSetWon(), true);
});

test('shortSetEndsAtConfiguredGames', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 3 }) });
  state.player1Games = 3;
  state.player2Games = 2;

  assert.equal(state.isSetWon(), true);
});

test('shortSetStartsTiebreakAtTwoAll', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 3 }) });
  state.player1Games = 2;
  state.player2Games = 2;

  assert.equal(state.shouldStartTiebreak(), true);
});

test('standardSetStartsTiebreakAtSixAll', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6 }) });
  state.player1Games = 6;
  state.player2Games = 6;

  assert.equal(state.shouldStartTiebreak(), true);
});

test('fourGameSetCanStartTheTiebreakAtThreeAll', () => {
  const config = new MatchConfig({ gamesPerSet: 4, tiebreakAtGames: 3 });
  assert.equal(config.tiebreakAt, 3);

  const state = matchState({ matchConfig: config });
  state.player1Games = 3;
  state.player2Games = 3;
  assert.equal(state.shouldStartTiebreak(), true);
  assert.equal(state.isSetWon(), false);

  // 4:0, 4:1 and 4:2 still take the set outright.
  for (const games of [0, 1, 2]) {
    state.player1Games = 4;
    state.player2Games = games;
    assert.equal(state.isSetWon(), true);
  }

  // 4:3 only exists as the game won in the tiebreak, which the reducer awards itself.
  state.player1Games = 4;
  state.player2Games = 3;
  assert.equal(state.isSetWon(), false);
});

test('tiebreakAtGamesOutsideTheFormatFallsBackToTheDefault', () => {
  assert.equal(new MatchConfig({ gamesPerSet: 4 }).tiebreakAt, 4);
  assert.equal(new MatchConfig({ gamesPerSet: 3 }).tiebreakAt, 2);
  assert.equal(new MatchConfig({ gamesPerSet: 6 }).tiebreakAt, 6);
  assert.equal(new MatchConfig({ gamesPerSet: 4, tiebreakAtGames: 9 }).tiebreakAt, 4);
  assert.equal(new MatchConfig({ gamesPerSet: 4, tiebreakAtGames: null }).tiebreakAt, 4);
  assert.equal(new MatchConfig({ gamesPerSet: 6, tiebreakAtGames: 5 }).copy().tiebreakAt, 5);
});

test('tiebreakPointsDisplayAsRawNumbers', () => {
  const state = matchState();
  state.isTiebreak = true;
  state.player1Points = 6;
  state.player2Points = 5;

  assert.equal(state.getPlayer1PointsDisplay(), '6');
  assert.equal(state.getPlayer2PointsDisplay(), '5');
});

test('tiebreakRequiresTwoPointAdvantage', () => {
  const state = matchState({ matchConfig: new MatchConfig({ tiebreakPoints: 7 }) });
  state.isTiebreak = true;
  state.player1Points = 7;
  state.player2Points = 6;

  assert.equal(state.isGameWon(), false);

  state.player1Points = 8;
  assert.equal(state.isGameWon(), true);
});

test('superTiebreakRequiresConfiguredPointsAndTwoPointAdvantage', () => {
  const state = matchState({ matchConfig: new MatchConfig({ superTiebreakPoints: 10 }) });
  state.isSuperTiebreak = true;
  state.player1Points = 10;
  state.player2Points = 9;

  assert.equal(state.isGameWon(), false);

  state.player1Points = 11;
  assert.equal(state.isGameWon(), true);
});

test('matchEndsWhenEitherPlayerReachesSetsToWin', () => {
  const state = matchState({ matchConfig: new MatchConfig({ setsToWin: 2 }) });
  state.player1Sets = 1;
  state.player2Sets = 1;

  assert.equal(state.shouldEndMatch(), false);

  state.player2Sets = 2;
  assert.equal(state.shouldEndMatch(), true);
});

test('doublesTeamNamesIncludeBothPartnersAndServerMarker', () => {
  const state = matchState({ isDoubles: true });
  state.currentServer = 3;

  assert.equal(state.getTeam1DisplayName(), 'Kowalski / Lis');
  assert.equal(state.getTeam1ServerAwareDisplayName(), 'Kowalski / 🎾 Lis');
  assert.equal(state.getTeam2ServerAwareDisplayName(), 'Nowak / Wojcik');
});

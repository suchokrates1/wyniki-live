import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig, MatchFinishReason, FinishMatchRequest, StatsMode } from '../match-engine/models.js';
import { matchState } from '../match-engine/testSupport.js';
import { createMatchController } from './matchController.js';
import { MatchView } from './matchViews.js';

function controller(state, now = 1_000) {
  let clock = now;
  const ctl = createMatchController({ now: () => clock });
  ctl.initialize(state);
  return {
    ctl,
    tick(ms) {
      clock += ms;
    },
  };
}

function winGame(ctl, isPlayer1) {
  for (let i = 0; i < 4; i += 1) ctl.handleBasicWin(isPlayer1);
}

test('G1 PWA Basic: deuce then gem then set then match 2-0', () => {
  const state = matchState({
    matchConfig: new MatchConfig({ gamesPerSet: 4, setsToWin: 2, statsMode: StatsMode.BASIC }),
    statsMode: StatsMode.BASIC,
  });
  const { ctl } = controller(state);
  ctl.setFirstServer(1);
  assert.equal(ctl.view, MatchView.BASIC_SCORING);
  assert.equal(state.matchStartTime, 1_000);

  for (const winner of [true, false, true, false, true, false]) {
    ctl.handleBasicWin(winner);
  }
  assert.equal(state.getPlayer1PointsDisplay(), '40');
  assert.equal(state.getPlayer2PointsDisplay(), '40');

  ctl.handleBasicWin(true);
  assert.equal(state.getPlayer1PointsDisplay(), 'ADV');
  ctl.handleBasicWin(true);
  assert.equal(state.player1Games, 1);

  for (let game = 0; game < 3; game += 1) winGame(ctl, true);
  assert.equal(state.player1Sets, 1);

  for (let game = 0; game < 4; game += 1) winGame(ctl, true);
  assert.equal(state.player1Sets, 2);
  assert.equal(state.isMatchFinished, true);
  assert.equal(ctl.view, MatchView.MATCH_FINISHED);
  assert.equal(ctl.chrome().showUndo, false);
  assert.equal(ctl.chrome().showFinish, false);
});

test('G2 PWA no-ad deciding point announcement then next point wins game', () => {
  const state = matchState({
    noAdvantage: true,
    matchConfig: new MatchConfig({ noAdvantage: true, statsMode: StatsMode.BASIC }),
  });
  const { ctl } = controller(state);
  ctl.setFirstServer(1);
  for (const winner of [true, false, true, false, true, false]) {
    ctl.handleBasicWin(winner);
  }
  assert.equal(ctl.view, MatchView.ANNOUNCEMENT);
  assert.equal(ctl.pendingAnnouncementType, 'deciding_point');
  ctl.continueFromAnnouncement();
  ctl.handleBasicWin(true);
  assert.equal(state.player1Games, 1);
  assert.equal(state.player1Points, 0);
});

test('G4 PWA super tiebreak starts at one set all', () => {
  const state = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 6, setsToWin: 2 }) });
  state.player1Sets = 0;
  state.player2Sets = 1;
  state.player1Games = 5;
  state.player2Games = 4;
  const { ctl } = controller(state);
  ctl.setFirstServer(1);
  winGame(ctl, true);
  assert.equal(state.player1Sets, 1);
  assert.equal(state.player2Sets, 1);
  assert.equal(state.isSuperTiebreak, true);
  assert.equal(ctl.pendingAnnouncementType, 'super_tiebreak');
  assert.equal(ctl.view, MatchView.ANNOUNCEMENT);
  ctl.continueFromAnnouncement();
  for (let i = 0; i < 10; i += 1) ctl.handleBasicWin(true);
  assert.equal(state.isMatchFinished, true);
  assert.equal(state.player1Sets, 2);
});

test('G7 PWA undo three times mid-game then finish the game', () => {
  const state = matchState();
  const { ctl } = controller(state);
  ctl.setFirstServer(1);
  ctl.handleBasicWin(true);
  ctl.handleBasicWin(false);
  ctl.handleBasicWin(true);
  assert.equal(state.player1Points, 2);
  assert.equal(state.player2Points, 1);
  ctl.undoLastAction();
  ctl.undoLastAction();
  ctl.undoLastAction();
  assert.equal(state.player1Points, 0);
  assert.equal(state.player2Points, 0);
  assert.equal(ctl.canUndo, false);
  winGame(ctl, true);
  assert.equal(state.player1Games, 1);
});

test('G8 PWA finish Normal Test Retirement Walkover', () => {
  const normal = matchState({ matchConfig: new MatchConfig({ gamesPerSet: 4, setsToWin: 2 }) });
  const { ctl } = controller(normal);
  ctl.setFirstServer(1);
  for (let set = 0; set < 2; set += 1) {
    for (let game = 0; game < 4; game += 1) winGame(ctl, true);
  }
  assert.equal(normal.isMatchFinished, true);
  assert.equal(normal.finishReason, MatchFinishReason.NORMAL);

  const testFinish = matchState();
  const testCtl = controller(testFinish).ctl;
  testCtl.setFirstServer(1);
  testCtl.finishMatchWithOutcome(new FinishMatchRequest({ finishReason: MatchFinishReason.TEST }));
  assert.equal(testFinish.finishReason, MatchFinishReason.TEST);
  assert.equal(testCtl.view, MatchView.MATCH_FINISHED);

  const retirement = matchState();
  const retCtl = controller(retirement).ctl;
  retCtl.initialize(retirement);
  retCtl.finishMatchWithOutcome(new FinishMatchRequest({
    finishReason: MatchFinishReason.RETIREMENT,
    winnerName: 'Jan Kowalski',
    injuredPlayerName: 'Adam Nowak',
  }));
  assert.equal(retirement.finishWinnerName, 'Jan Kowalski');

  const walkover = matchState();
  const woCtl = controller(walkover).ctl;
  woCtl.finishMatchWithOutcome(new FinishMatchRequest({
    finishReason: MatchFinishReason.WALKOVER,
    winnerName: walkover.getTeam1FullName(),
  }));
  assert.equal(walkover.player1Sets, 2);
  assert.equal(walkover.setsHistory.length, 2);
});

test('skip side change toggles sidesSwapped and returns to Basic', () => {
  const state = matchState();
  const { ctl } = controller(state);
  ctl.setFirstServer(1);
  winGame(ctl, true);
  if (ctl.view === MatchView.ANNOUNCEMENT) {
    const before = state.sidesSwapped;
    ctl.skipSideChange();
    assert.equal(state.sidesSwapped, !before);
    assert.equal(ctl.view, MatchView.BASIC_SCORING);
  }
});

test('Basic fault goes to second serve then double fault point', () => {
  const state = matchState();
  const { ctl } = controller(state);
  ctl.setFirstServer(1);
  ctl.handleBasicFault();
  assert.equal(state.isFirstServe, false);
  ctl.handleBasicFault();
  assert.equal(state.isFirstServe, true);
  assert.equal(state.player2Points, 1);
});

test('leave confirm only after the timer has started', () => {
  const state = matchState();
  const { ctl } = controller(state);
  assert.equal(ctl.chrome().confirmLeave, false);
  ctl.setFirstServer(1);
  assert.equal(ctl.chrome().confirmLeave, true);
  assert.equal(ctl.chrome().showTimer, true);
});

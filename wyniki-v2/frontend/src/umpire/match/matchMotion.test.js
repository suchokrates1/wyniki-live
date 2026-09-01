import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { MatchView } from './matchViews.js';
import {
  motionPatches,
  panelVisible,
  snapshotMatchMotion,
} from './matchMotion.js';

test('first snapshot only enters the current panel', () => {
  const next = snapshotMatchMotion(matchState(), MatchView.SERVER_SELECTION);
  const patch = motionPatches(null, next);
  assert.equal(patch.enteringView, MatchView.SERVER_SELECTION);
  assert.equal(patch.leavingView, null);
  assert.equal(patch.pulseP1, undefined);
});

test('WIN pulses the scoring player and a game win pulses the set cell', () => {
  const state = matchState();
  const prev = snapshotMatchMotion(state, MatchView.BASIC_SCORING);
  state.player1Points = 1;
  const afterPoint = snapshotMatchMotion(state, MatchView.BASIC_SCORING);
  const pointPatch = motionPatches(prev, afterPoint);
  assert.equal(pointPatch.pulseP1, true);
  assert.equal(pointPatch.pulseP2, undefined);

  state.player1Points = 0;
  state.player1Games = 1;
  const afterGame = snapshotMatchMotion(state, MatchView.BASIC_SCORING);
  const gamePatch = motionPatches(afterPoint, afterGame);
  assert.equal(gamePatch.pulseSet1P1, true);
  assert.equal(gamePatch.pulseP1, true);
});

test('serve change moves the ball and swaps scoring cards', () => {
  const state = matchState();
  const prev = snapshotMatchMotion(state, MatchView.BASIC_SCORING);
  state.isPlayer1Serving = false;
  const next = snapshotMatchMotion(state, MatchView.BASIC_SCORING);
  const patch = motionPatches(prev, next);
  assert.equal(patch.serveLeaveP1, true);
  assert.equal(patch.serveEnterP2, true);
  assert.equal(patch.cardSwap, true);
});

test('panel change records exit then enter', () => {
  const state = matchState();
  const prev = snapshotMatchMotion(state, MatchView.SERVE);
  const next = snapshotMatchMotion(state, MatchView.RALLY);
  const patch = motionPatches(prev, next);
  assert.equal(patch.leavingView, MatchView.SERVE);
  assert.equal(patch.enteringView, MatchView.RALLY);
  assert.equal(panelVisible(MatchView.RALLY, MatchView.SERVE, MatchView.SERVE), true);
  assert.equal(panelVisible(MatchView.RALLY, MatchView.SERVE, MatchView.BASIC_SCORING), false);
});

test('second serve flags basic vs advanced', () => {
  const state = matchState();
  state.isFirstServe = true;
  const prev = snapshotMatchMotion(state, MatchView.BASIC_SCORING);
  state.isFirstServe = false;
  const basic = motionPatches(prev, snapshotMatchMotion(state, MatchView.BASIC_SCORING));
  assert.equal(basic.secondServe, true);
  const advanced = motionPatches(
    snapshotMatchMotion(state.copy({ isFirstServe: true }), MatchView.SERVE),
    snapshotMatchMotion(state, MatchView.SERVE),
  );
  assert.equal(advanced.secondServeAdvanced, true);
});

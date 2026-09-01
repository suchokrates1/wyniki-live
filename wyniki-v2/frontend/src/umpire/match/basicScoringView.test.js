import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { buildBasicScoring, isServerOnLeft } from './basicScoringView.js';

test('Basic buttons flip with sidesSwapped and second serve', () => {
  const state = matchState();
  let view = buildBasicScoring(state);
  assert.equal(view.serverOnLeft, true);
  assert.equal(view.leftIsPlayer1, true);
  assert.equal(view.faultKind, 'second');
  assert.equal(view.showServerLeft, true);
  assert.equal(view.showReceiverRight, true);

  state.isFirstServe = false;
  state.sidesSwapped = true;
  view = buildBasicScoring(state);
  assert.equal(isServerOnLeft(state), false);
  assert.equal(view.leftIsPlayer1, false);
  assert.equal(view.faultKind, 'double');
  assert.equal(view.showServerRight, true);
});

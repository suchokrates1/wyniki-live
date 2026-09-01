import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { buildAdvancedRally, buildAdvancedServe } from './advancedScoringView.js';

test('Advanced serve buttons sit on the server side like Android', () => {
  const state = matchState();
  let view = buildAdvancedServe(state);
  assert.equal(view.showServeLeft, true);
  assert.equal(view.showServeRight, false);
  assert.equal(view.leftIsPlayer1, true);

  state.sidesSwapped = true;
  view = buildAdvancedServe(state);
  assert.equal(view.showServeLeft, false);
  assert.equal(view.showServeRight, true);
  assert.equal(view.leftIsPlayer1, false);
});

test('Advanced rally maps left/right to player1 via sidesSwapped', () => {
  const state = matchState();
  state.sidesSwapped = true;
  const view = buildAdvancedRally(state);
  assert.equal(view.leftIsPlayer1, false);
  assert.equal(view.rightIsPlayer1, true);
  assert.equal(view.leftName, 'Nowak');
});

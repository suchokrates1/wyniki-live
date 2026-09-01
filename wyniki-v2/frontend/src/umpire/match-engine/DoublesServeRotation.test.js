import assert from 'node:assert/strict';
import test from 'node:test';
import { DoublesServeRotation } from './doublesServeRotation.js';
import { matchState } from './testSupport.js';

test('nextServerUsesStandardDoublesOrder', () => {
  assert.equal(DoublesServeRotation.nextServer(1), 2);
  assert.equal(DoublesServeRotation.nextServer(2), 3);
  assert.equal(DoublesServeRotation.nextServer(3), 4);
  assert.equal(DoublesServeRotation.nextServer(4), 1);
});

test('invalidServerFallsBackToFirstServer', () => {
  assert.equal(DoublesServeRotation.nextServer(0), 1);
  assert.equal(DoublesServeRotation.nextServer(99), 1);
});

test('teamOneServesForSlotsOneAndThree', () => {
  assert.equal(DoublesServeRotation.isTeamOneServing(1), true);
  assert.equal(DoublesServeRotation.isTeamOneServing(2), false);
  assert.equal(DoublesServeRotation.isTeamOneServing(3), true);
  assert.equal(DoublesServeRotation.isTeamOneServing(4), false);
});

test('rotateUpdatesServerAndServingTeamTogether', () => {
  const state = matchState({ isDoubles: true });
  state.currentServer = 1;
  state.isPlayer1Serving = true;

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 2);
  assert.equal(state.isPlayer1Serving, false);

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 3);
  assert.equal(state.isPlayer1Serving, true);

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 4);
  assert.equal(state.isPlayer1Serving, false);

  DoublesServeRotation.rotate(state);
  assert.equal(state.currentServer, 1);
  assert.equal(state.isPlayer1Serving, true);
});

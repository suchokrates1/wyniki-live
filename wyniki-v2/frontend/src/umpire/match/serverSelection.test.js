import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { buildServerButtons, resolveServerNumber } from './serverSelection.js';

test('singles server buttons follow sidesSwapped', () => {
  const state = matchState();
  const buttons = buildServerButtons(state);
  assert.equal(buttons[0].serverNumber, 1);
  assert.equal(buttons[1].serverNumber, 2);
  assert.equal(buttons[2].visible, false);
  assert.equal(resolveServerNumber(1, state), 1);

  state.sidesSwapped = true;
  assert.equal(resolveServerNumber(1, state), 2);
  assert.equal(resolveServerNumber(2, state), 1);
  const swapped = buildServerButtons(state);
  assert.equal(swapped[0].label.includes('Nowak'), true);
  assert.equal(swapped[1].label.includes('Kowalski'), true);
});

test('doubles server buttons keep four slots and team colors', () => {
  const state = matchState({ isDoubles: true });
  const buttons = buildServerButtons(state);
  assert.deepEqual(buttons.map((button) => button.serverNumber), [1, 2, 3, 4]);
  assert.equal(buttons[0].colorRole, 'Team1');
  assert.equal(buttons[1].colorRole, 'Team2');
  state.sidesSwapped = true;
  assert.deepEqual(
    buildServerButtons(state).map((button) => button.serverNumber),
    [2, 1, 4, 3],
  );
});

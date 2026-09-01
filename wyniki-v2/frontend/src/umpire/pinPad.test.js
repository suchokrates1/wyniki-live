import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinPad } from './pinPad.js';

test('append builds a four digit pin then stops', () => {
  const pad = createPinPad();
  pad.append(1);
  pad.append('2');
  pad.append(3);
  assert.equal(pad.complete, false);
  pad.append(4);
  assert.equal(pad.value, '1234');
  assert.equal(pad.complete, true);
  pad.append(5);
  assert.equal(pad.value, '1234');
});

test('backspace and clear match Android PIN boxes', () => {
  const pad = createPinPad();
  pad.append(1);
  pad.append(2);
  pad.backspace();
  assert.equal(pad.value, '1');
  assert.deepEqual(pad.boxes(), ['1', '', '', '']);
  pad.clear();
  assert.equal(pad.value, '');
  assert.equal(pad.complete, false);
});

test('non digits are ignored', () => {
  const pad = createPinPad();
  pad.append('a');
  pad.append('12');
  pad.append('');
  assert.equal(pad.value, '');
});

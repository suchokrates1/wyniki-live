import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { formatDuration, matchTimerText } from './matchTimer.js';

test('timer formats like Android MatchTimerRenderer', () => {
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_661_000), '1:01:01');
  const state = matchState();
  state.matchStartTime = 1_000;
  assert.equal(matchTimerText(state, 61_000), '01:00');
  state.isMatchFinished = true;
  state.matchDuration = 90_000;
  assert.equal(matchTimerText(state, 999_000), '01:30');
});

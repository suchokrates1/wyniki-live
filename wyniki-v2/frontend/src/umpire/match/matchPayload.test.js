import assert from 'node:assert/strict';
import test from 'node:test';
import { FinishMatchRequest, MatchFinishReason } from '../match-engine/models.js';
import { matchState } from '../match-engine/testSupport.js';
import { toApiFinishReason, toFinishPayload, toMatchPayload, toStatisticsPayload } from './matchPayload.js';

test('match payload uses Android snake_case and lowercase finish reasons', () => {
  const state = matchState();
  state.matchStartTime = 1_000;
  state.scheduleId = 44;
  const payload = toMatchPayload(state);
  assert.equal(payload.court_id, '1');
  assert.equal(payload.player1_name, 'Jan Kowalski');
  assert.equal(payload.status, 'in_progress');
  assert.equal(payload.schedule_id, 44);
  assert.equal(payload.match_config.games_per_set, 4);
  assert.equal(toApiFinishReason(MatchFinishReason.WALKOVER), 'walkover');
  assert.equal(toFinishPayload(new FinishMatchRequest({ finishReason: MatchFinishReason.TEST })).finish_reason, 'test');
  assert.equal(toStatisticsPayload(state), null);
});

test('doubles API names use A / B team strings', () => {
  const state = matchState({
    isDoubles: true,
    team1Name: 'Kowalski / Lis',
    team2Name: 'Nowak / Wojcik',
  });
  const payload = toMatchPayload(state);
  assert.equal(payload.player1_name, 'Kowalski / Lis');
  assert.equal(payload.player2_name, 'Nowak / Wojcik');
  assert.match(payload.player1_name, / \/ /);
});

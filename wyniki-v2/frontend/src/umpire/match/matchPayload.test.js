import assert from 'node:assert/strict';
import test from 'node:test';
import { FinishMatchRequest, MatchFinishReason } from '../match-engine/models.js';
import { matchState } from '../match-engine/testSupport.js';
import { toApiFinishReason, toFinishPayload, toMatchEventPayload, toMatchPayload, toStatisticsPayload } from './matchPayload.js';

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
  assert.equal(payload.match_start_time_ms, 1_000);
  assert.equal(toApiFinishReason(MatchFinishReason.WALKOVER), 'walkover');
  assert.equal(toFinishPayload(new FinishMatchRequest({ finishReason: MatchFinishReason.TEST })).finish_reason, 'test');
  assert.equal(toStatisticsPayload(state), null);
});

test('match payload omits start time before the umpire clock starts', () => {
  const payload = toMatchPayload(matchState());
  assert.equal(payload.match_start_time_ms, null);
  assert.equal(payload.status, 'not_started');
});

test('match-event payload matches Android MatchEventFactory snake_case', () => {
  const state = matchState({ matchId: 42, clientMatchUuid: 'uuid-event' });
  state.matchId = 42;
  state.isPlayer1Serving = true;
  state.player1Sets = 1;
  state.player1Games = 4;
  state.player1Points = 2;
  state.isTiebreak = true;
  state.player1Stats.aces = 2;
  const event = toMatchEventPayload(state, 'Point', 12_345);
  assert.equal(event.event_type, 'point');
  assert.equal(event.court_id, '1');
  assert.equal(event.match_id, 42);
  assert.equal(event.client_match_uuid, 'uuid-event');
  assert.equal(event.player1.name, 'Kowalski');
  assert.equal(event.player1.full_name, 'Jan Kowalski');
  assert.equal(event.player1.flag, 'PL');
  assert.equal(event.player1.is_serving, true);
  assert.equal(event.player2.is_serving, false);
  assert.equal(event.score.player1_points, 2);
  assert.equal(event.score.is_tiebreak, true);
  assert.equal(event.stats.player1_aces, 2);
  assert.equal(event.timestamp, 12_345);
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

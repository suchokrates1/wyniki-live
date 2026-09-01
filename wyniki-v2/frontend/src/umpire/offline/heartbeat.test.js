import assert from 'node:assert/strict';
import test from 'node:test';
import { createHeartbeat, heartbeatBody } from './heartbeat.js';

test('heartbeat omits battery and sends court + version', () => {
  const body = heartbeatBody({
    courtId: 't31-1',
    screen: 'Match:BASIC_SCORING',
    matchId: 12,
    clientMatchUuid: 'abc',
    nowMs: 1_700,
    appVersion: '2.0.0',
  });
  assert.equal(body.court_id, 't31-1');
  assert.equal(body.app_version, '2.0.0');
  assert.equal(body.screen, 'Match:BASIC_SCORING');
  assert.equal(body.match_id, '12');
  assert.equal(body.timestamp, '1700');
  assert.equal('battery_level' in body, false);
  assert.equal('is_charging' in body, false);
});

test('heartbeat does not POST before a court token exists', async () => {
  const sent = [];
  const beat = createHeartbeat({
    send: async (body) => {
      sent.push(body);
      return { ok: true };
    },
    getBody: () => ({ court_id: '' }),
    canSend: () => false,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  beat.start();
  await beat.sendNow();
  assert.deepEqual(sent, []);
});

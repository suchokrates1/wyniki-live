import assert from 'node:assert/strict';
import test from 'node:test';
import { createHeartbeat, heartbeatBody } from './heartbeat.js';

test('heartbeat sends court, version, and battery when the PWA can read it', () => {
  const bare = heartbeatBody({
    courtId: 't31-1',
    screen: 'Match:BASIC_SCORING',
    matchId: 12,
    clientMatchUuid: 'abc',
    nowMs: 1_700,
    appVersion: '2.0.0',
  });
  assert.equal(bare.court_id, 't31-1');
  assert.equal(bare.app_version, '2.0.0');
  assert.equal(bare.screen, 'Match:BASIC_SCORING');
  assert.equal(bare.match_id, '12');
  assert.equal(bare.timestamp, '1700');
  assert.equal('battery_level' in bare, false);
  assert.equal('is_charging' in bare, false);

  const withBattery = heartbeatBody({
    courtId: 't31-1',
    batteryLevel: 64,
    isCharging: true,
    nowMs: 1,
    appVersion: '2.0.0',
  });
  assert.equal(withBattery.battery_level, 64);
  assert.equal(withBattery.is_charging, true);
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

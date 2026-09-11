import assert from 'node:assert/strict';
import test from 'node:test';
import { calcMatchTime, matchElapsedSeconds, parseTimestampSeconds } from './matchTime.js';

test('parseTimestampSeconds accepts ISO and epoch ms', () => {
  assert.equal(parseTimestampSeconds('2026-09-01T10:00:00.000Z'), Date.parse('2026-09-01T10:00:00.000Z') / 1000);
  assert.equal(parseTimestampSeconds(1_725_188_400_000), 1_725_188_400);
});

test('live overlay clock uses started_ts, not frozen seconds=0', () => {
  const started = '2026-09-01T10:00:00.000Z';
  const nowMs = Date.parse('2026-09-01T11:03:00.000Z');
  const court = {
    match_status: { active: true },
    match_time: {
      seconds: 0,
      running: true,
      offset_seconds: 0,
      started_ts: started,
      resume_ts: started,
    },
  };
  assert.equal(matchElapsedSeconds(court.match_time, nowMs), 3780);
  assert.equal(calcMatchTime(court, nowMs), '01:03');
});

test('clock stays hidden until the umpire start is known', () => {
  assert.equal(calcMatchTime({
    match_status: { active: true },
    match_time: { seconds: 0, running: false, started_ts: null },
  }, Date.now()), null);
});

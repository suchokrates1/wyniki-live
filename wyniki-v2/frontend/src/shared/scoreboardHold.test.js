import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCOREBOARD_HOLD_MS,
  courtHasPlayers,
  courtIdentityKey,
  holdRemainingMs,
  isScoreboardHeld,
  planScoreboardVisibility,
  reduceHoldSlot,
} from './scoreboardHold.js';

const NOW = Date.parse('2026-09-12T12:00:00.000Z');

function court(spec) {
  return {
    match_status: {
      active: spec.active !== false,
      last_completed: spec.lastCompleted || null,
    },
    match_time: { finished_ts: spec.finishedTs || null },
    A: { full_name: spec.a ?? 'Ada Nowak', surname: spec.a ?? 'Nowak' },
    B: { full_name: spec.b ?? 'Ewa Lis', surname: spec.b ?? 'Lis' },
  };
}

test('live named match is held', () => {
  assert.equal(isScoreboardHeld(court({ active: true }), NOW), true);
  assert.equal(holdRemainingMs(court({ active: true }), NOW), null);
});

test('finished score stays for five minutes', () => {
  const finished = court({
    active: false,
    lastCompleted: '2026-09-12T11:57:00.000Z',
  });
  assert.equal(isScoreboardHeld(finished, NOW), true);
  assert.equal(holdRemainingMs(finished, NOW), 2 * 60 * 1000);
  assert.equal(isScoreboardHeld(finished, NOW + 2 * 60 * 1000), false);
});

test('finished score older than hold is not shown', () => {
  const finished = court({
    active: false,
    lastCompleted: '2026-09-12T11:54:00.000Z',
  });
  assert.equal(isScoreboardHeld(finished, NOW), false);
  assert.equal(holdRemainingMs(finished, NOW), 0);
});

test('assigned names before the match starts stay visible', () => {
  const lineup = court({ active: false });
  lineup.match_status.last_completed = null;
  lineup.match_time.finished_ts = null;
  assert.equal(courtHasPlayers(lineup), true);
  assert.equal(isScoreboardHeld(lineup, NOW), true);
});

test('empty placeholders are not held', () => {
  assert.equal(isScoreboardHeld(court({ active: true, a: '-', b: '—' }), NOW), false);
  assert.equal(isScoreboardHeld(null, NOW), false);
});

test('identity key ignores case and extra spaces', () => {
  assert.equal(
    courtIdentityKey(court({ a: 'Ada  Nowak', b: 'Ewa Lis' })),
    courtIdentityKey(court({ a: 'ada nowak', b: 'EWA LIS' })),
  );
  assert.notEqual(
    courtIdentityKey(court({ a: 'Ada Nowak', b: 'Ewa Lis' })),
    courtIdentityKey(court({ a: 'Piotr Kot', b: 'Jan Bąk' })),
  );
});

test('plan: same names update in place', () => {
  const live = court({ active: true });
  assert.deepEqual(
    planScoreboardVisibility({
      phase: 'visible',
      displayedIdentity: courtIdentityKey(live),
      court: live,
      now: NOW,
    }),
    { action: 'update', identity: courtIdentityKey(live) },
  );
});

test('plan: hold expiry exits, new names swap, empty stays hidden', () => {
  const oldNames = court({
    active: false,
    lastCompleted: '2026-09-12T11:57:00.000Z',
    a: 'Ada Nowak',
    b: 'Ewa Lis',
  });
  const expired = court({
    active: false,
    lastCompleted: '2026-09-12T11:54:00.000Z',
    a: 'Ada Nowak',
    b: 'Ewa Lis',
  });
  const incoming = court({ active: true, a: 'Piotr Kot', b: 'Jan Bąk' });

  assert.equal(
    planScoreboardVisibility({
      phase: 'visible',
      displayedIdentity: courtIdentityKey(oldNames),
      court: expired,
      now: NOW,
    }).action,
    'exit',
  );
  assert.equal(
    planScoreboardVisibility({
      phase: 'visible',
      displayedIdentity: courtIdentityKey(oldNames),
      court: incoming,
      now: NOW,
    }).action,
    'swap',
  );
  assert.equal(
    planScoreboardVisibility({
      phase: 'hidden',
      displayedIdentity: '',
      court: expired,
      now: NOW,
    }).action,
    'idle-hidden',
  );
  assert.equal(
    planScoreboardVisibility({
      phase: 'exiting',
      displayedIdentity: courtIdentityKey(oldNames),
      court: incoming,
      now: NOW,
    }).action,
    'hold-exit',
  );
});

test('reduceHoldSlot freezes the previous names on swap, not the incoming pair', () => {
  const shown = court({ active: false, lastCompleted: '2026-09-12T11:57:00.000Z' });
  const next = court({ active: true, a: 'Piotr Kot', b: 'Jan Bąk' });
  const visible = reduceHoldSlot(null, shown, NOW);
  assert.equal(visible.effect, 'enter');

  const swapped = reduceHoldSlot(visible.slot, next, NOW);
  assert.equal(swapped.effect, 'swap');
  assert.equal(swapped.slot.phase, 'swapping');
  assert.equal(swapped.slot.frozen.A.full_name, 'Ada Nowak');
  assert.equal(swapped.slot.pendingIdentity, courtIdentityKey(next));
});

test('hold window uses the shared five-minute constant', () => {
  assert.equal(SCOREBOARD_HOLD_MS, 300000);
});

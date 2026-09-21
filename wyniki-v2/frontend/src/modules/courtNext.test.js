import assert from 'node:assert/strict';
import test from 'node:test';

import { nextMatchForCourt, pageFeatures } from './courtNext.js';

const today = '2026-09-26';
const schedule = {
  days: [
    {
      date: today,
      categories: [
        {
          matches: [
            { id: 1, court_id: 't32-1', scheduled_time: '09:00', status: 'completed', has_result: true, player1_name: 'Jerzy Janas', player2_name: 'Bernadeta Kozioł' },
            { id: 2, court_id: 't32-1', scheduled_time: '09:40', status: 'planned', player1_name: 'Mateusz Ciborowski', player2_name: 'Tomasz Gawrych' },
            { id: 3, court_id: 't32-1', scheduled_time: '11:30', status: 'planned', player1_name: 'Łukasz Konklewski', player2_name: 'Michał Orchowski' },
            { id: 4, court_id: 't32-2', scheduled_time: '10:00', status: 'planned', player1_name: 'Michał Stypa', player2_name: 'Emil Stopierzyński' },
          ],
        },
      ],
    },
    { date: '2026-09-27', categories: [{ matches: [{ id: 5, court_id: 't32-3', scheduled_time: '09:00', status: 'planned' }] }] },
  ],
};

test('the next pending match on the court skips the one being played', () => {
  const live = ['Tomasz Gawrych', 'Mateusz Ciborowski'];
  assert.equal(nextMatchForCourt(schedule, 't32-1', { today, liveNames: live }).id, 3);
});

test('without a live match the earliest pending match is next', () => {
  assert.equal(nextMatchForCourt(schedule, 't32-1', { today }).id, 2);
});

test('a court whose matches are all played is on its last match', () => {
  const played = structuredClone(schedule);
  for (const match of played.days[0].categories[0].matches) match.status = 'completed';
  assert.deepEqual(nextMatchForCourt(played, 't32-1', { today }), { last: true });
});

test('a schedule entry already linked to the live match does not count as next', () => {
  const linked = structuredClone(schedule);
  linked.days[0].categories[0].matches[1].match_status = 'in_progress';
  assert.equal(nextMatchForCourt(linked, 't32-1', { today }).id, 3);
});

test('a court with nothing today shows nothing', () => {
  assert.equal(nextMatchForCourt(schedule, 't32-3', { today }), null);
  assert.equal(nextMatchForCourt(null, 't32-1', { today }), null);
});

test('features come from the meta tag the server stamps', () => {
  const doc = { querySelector: () => ({ getAttribute: () => 'court-next other' }) };
  assert.deepEqual([...pageFeatures(doc)], ['court-next', 'other']);
  assert.equal(pageFeatures({ querySelector: () => null }).size, 0);
});

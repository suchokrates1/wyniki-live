import assert from 'node:assert/strict';
import test from 'node:test';

import { courtBattery, courtRow, courtScoreLine, createCourtsListView } from './courtsList.js';

const live = {
  match_status: { active: true },
  current_set: 2,
  A: { surname: 'Kokot', current_games: 2, points: '30', set1: 4, set2: 2, set3: 0 },
  B: { surname: 'Nowak', current_games: 1, points: '15', set1: 3, set2: 1, set3: 0 },
  battery_level: 17,
};

test('the score line shows finished sets, current games and points', () => {
  assert.equal(courtScoreLine(live), '4:3 2:1 · 2:1 (30:15)');
  assert.equal(courtScoreLine({ A: {}, B: {} }), '0:0 (0:0)');
});

test('a set that has not started yet is not shown', () => {
  const thirdSetAhead = { ...live, current_set: 1 };
  assert.equal(courtScoreLine(thirdSetAhead), '4:3 · 2:1 (30:15)');
});

test('battery is coloured by how much is left', () => {
  assert.deepEqual(courtBattery({ battery_level: 82 }), { text: '82%', tone: 'ok' });
  assert.deepEqual(courtBattery({ battery_level: 35 }), { text: '35%', tone: 'warn' });
  assert.deepEqual(courtBattery({ battery_level: 12, is_charging: true }), { text: '12% ⚡', tone: 'alert' });
  assert.deepEqual(courtBattery({}), { text: '—', tone: 'muted' });
});

test('a playing court names both players; a free one says so', () => {
  const playing = courtRow({ kort_id: 't32-1', name: '1', pin: '0000' }, live);
  assert.equal(playing.state.label, 'W GRZE');
  assert.equal(playing.players, 'Kokot — Nowak');
  assert.equal(playing.weakPin, true);

  const free = courtRow({ kort_id: 't32-4', name: '4', pin: '8261' }, {});
  assert.equal(free.state.label, 'WOLNY');
  assert.equal(free.players, '');
  assert.equal(free.score, '');
  assert.equal(free.weakPin, false);
});

test('groups keep their tournament name and mark the courts with no tournament', () => {
  const view = Object.assign({
    visibleCourtGroups: [
      { id: '32', name: 'RAKIETY ATNiS VII', courts: [{ kort_id: 't32-1', name: '1', pin: '0000' }] },
      { id: '__none__', name: 'Bez przypisania', courts: [{ kort_id: 'review-1', name: '1', pin: '8261' }] },
    ],
    courtData: { 't32-1': live },
  }, createCourtsListView());
  const groups = view.adminCourtGroups();
  assert.deepEqual(groups.map((group) => group.isUnassigned), [false, true]);
  assert.equal(groups[0].courts[0].battery.text, '17%');
  assert.equal(groups[1].courts[0].state.label, 'WOLNY');
});

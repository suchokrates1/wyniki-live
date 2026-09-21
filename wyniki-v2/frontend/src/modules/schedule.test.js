import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScheduleGroups, normalizeScheduleText, scheduleMatchMatchesQuery } from './schedule.js';

const doublesMatch = {
  player1_name: 'Anna Kowalska / Ewa Nowak',
  player2_name: 'Jan Lewandowski / Piotr Wiśniewski',
  notes_public: '',
};

test('schedule search matches either partner in a pair label', () => {
  const options = { resolveName: (name) => name, courtLabel: () => 'Kort 1' };
  assert.equal(
    scheduleMatchMatchesQuery(doublesMatch, normalizeScheduleText('Kowalska'), options),
    true,
  );
  assert.equal(
    scheduleMatchMatchesQuery(doublesMatch, normalizeScheduleText('Nowak'), options),
    true,
  );
  assert.equal(
    scheduleMatchMatchesQuery(doublesMatch, normalizeScheduleText('Wiśniewski'), options),
    true,
  );
  assert.equal(
    scheduleMatchMatchesQuery(doublesMatch, normalizeScheduleText('Lewandowski'), options),
    true,
  );
  assert.equal(
    scheduleMatchMatchesQuery(doublesMatch, normalizeScheduleText('Nowacka'), options),
    false,
  );
});

test('a search shows every matching match of the day in one time-ordered list', () => {
  const day = {
    date: '2026-09-26',
    categories: [{
      matches: [
        { id: 1, court_id: 't32-2', scheduled_time: '11:30', player1_name: 'Michał Stypa', player2_name: 'Jan Kowalski' },
        { id: 2, court_id: 't32-1', scheduled_time: '09:00', player1_name: 'Michał Stypa', player2_name: 'Emil Stopierzyński' },
        { id: 3, court_id: 't32-1', scheduled_time: '10:00', player1_name: 'Jerzy Janas', player2_name: 'Bernadeta Kozioł' },
      ],
    }],
  };
  const groups = buildScheduleGroups(day, { search: 'stypa', searchResultsLabel: 'Wyniki wyszukiwania', courtLabel: (m) => m.court_id });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Wyniki wyszukiwania');
  assert.deepEqual(groups[0].matches.map((m) => m.id), [2, 1]);
  assert.deepEqual(buildScheduleGroups(day, { search: 'nikt' }), []);
  assert.equal(buildScheduleGroups(day, { search: '', courtLabel: (m) => m.court_id }).length, 2);
});

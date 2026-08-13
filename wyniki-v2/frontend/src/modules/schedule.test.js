import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeScheduleText, scheduleMatchMatchesQuery } from './schedule.js';

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

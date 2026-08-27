import assert from 'node:assert/strict';
import test from 'node:test';
import {
  abbreviateCompetitorName,
  competitorSearchTokens,
  formatTeamLabelForWrap,
  isTeamDisplayName,
  registerCompetitorName,
  splitTeamDisplayName,
  TEAM_WRAP_BREAK,
} from './teamDisplay.js';

const PAIR = 'Anna Kowalska / Ewa Nowak';

test('splitTeamDisplayName reads both partners and ignores wrap marks', () => {
  assert.deepEqual(splitTeamDisplayName(PAIR), ['Anna Kowalska', 'Ewa Nowak']);
  assert.deepEqual(
    splitTeamDisplayName(`Anna Kowalska / ${TEAM_WRAP_BREAK}Ewa Nowak`),
    ['Anna Kowalska', 'Ewa Nowak'],
  );
  assert.equal(splitTeamDisplayName('Jan Kowalski'), null);
});

test('formatTeamLabelForWrap inserts a break after the pair separator', () => {
  const wrapped = formatTeamLabelForWrap(PAIR);
  assert.equal(wrapped.includes(`${TEAM_WRAP_BREAK}Ewa Nowak`), true);
  assert.equal(formatTeamLabelForWrap(wrapped), wrapped);
  assert.equal(formatTeamLabelForWrap('Jan Kowalski'), 'Jan Kowalski');
});

test('registerCompetitorName does not map a pair surname token', () => {
  const map = {};
  registerCompetitorName(map, PAIR);
  registerCompetitorName(map, 'Jan Kowalski');
  assert.equal(map.Nowak, undefined);
  assert.equal(map.Kowalska, undefined);
  assert.equal(map.Kowalski, 'Jan Kowalski');
});

test('competitorSearchTokens include both partners and reversed order', () => {
  const tokens = competitorSearchTokens(PAIR).join(' ').toLowerCase();
  assert.equal(tokens.includes('kowalska'), true);
  assert.equal(tokens.includes('nowak'), true);
  assert.equal(tokens.includes('ewa nowak / anna kowalska'), true);
});

test('abbreviateCompetitorName shortens each partner, not the slash token', () => {
  assert.equal(abbreviateCompetitorName(PAIR), 'A. Kowalska / E. Nowak');
  assert.equal(abbreviateCompetitorName('Dawid Suchodolski / Jan Kowalski'), 'D. Suchodolski / J. Kowalski');
  assert.equal(abbreviateCompetitorName('Jan Kowalski'), 'J. Kowalski');
  assert.equal(isTeamDisplayName(PAIR), true);
  assert.equal(isTeamDisplayName('Jan Kowalski'), false);
});

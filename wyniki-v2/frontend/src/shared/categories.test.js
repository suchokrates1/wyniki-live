import assert from 'node:assert/strict';
import test from 'node:test';
import {
  doublesPartnerBands,
  inferPlanningGenderFromLabel,
  planningDivisionFromGroupName,
  playerMatchesDoublesCategory,
  playerMatchesTournamentCategory,
  tournamentCategoryDivisionKey,
} from './categories.js';

const B1_WOMEN = { preset_key: 'B1K', label: 'B1 Women', hint_bands: ['B1'] };
const B1_MEN = { preset_key: 'B1M', label: 'B1 Men', hint_bands: ['B1'] };

test('preset B1K matches only B1 women', () => {
  assert.equal(tournamentCategoryDivisionKey(B1_WOMEN), 'B1K');
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'K' }, B1_WOMEN), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'F' }, B1_WOMEN), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'M' }, B1_WOMEN), false);
  assert.equal(playerMatchesTournamentCategory({ category: 'B2', gender: 'K' }, B1_WOMEN), false);
});

test('preset B1M matches only B1 men', () => {
  assert.equal(tournamentCategoryDivisionKey(B1_MEN), 'B1M');
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'M' }, B1_MEN), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'K' }, B1_MEN), false);
});

test('English Women label without preset still selects women, not men', () => {
  const cat = { preset_key: '', label: 'B1 Women', hint_bands: ['B1'] };
  assert.equal(inferPlanningGenderFromLabel('B1 Women'), 'K');
  assert.equal(inferPlanningGenderFromLabel('B1 Men'), 'M');
  assert.equal(tournamentCategoryDivisionKey(cat), 'B1K');
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'K' }, cat), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'M' }, cat), false);
});

test('group names with Women/Men parse to B1K/B1M', () => {
  assert.equal(planningDivisionFromGroupName('B1 Women — Grupa A'), 'B1K');
  assert.equal(planningDivisionFromGroupName('B1 Men — Grupa B'), 'B1M');
});

test('B3/4 mixed matches B3 and B4 of any gender', () => {
  const cat = { preset_key: '', label: 'B3/4 Mixed', hint_bands: ['B3', 'B4'] };
  assert.equal(tournamentCategoryDivisionKey(cat), 'B34');
  assert.equal(playerMatchesTournamentCategory({ category: 'B3', gender: 'M' }, cat), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B4', gender: 'K' }, cat), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B1', gender: 'M' }, cat), false);
});

test('doubles partner pool uses visual class only, not singles gender', () => {
  const fromWomenPreset = { preset_key: 'B1K', label: 'B1 Women', hint_bands: ['B1'], is_doubles: true };
  const openDouble = { preset_key: '', label: 'B1 Double', hint_bands: ['B1'], is_doubles: true };
  assert.deepEqual(doublesPartnerBands(fromWomenPreset), ['B1']);
  assert.equal(playerMatchesDoublesCategory({ category: 'B1', gender: 'M' }, fromWomenPreset), true);
  assert.equal(playerMatchesDoublesCategory({ category: 'B1', gender: 'K' }, fromWomenPreset), true);
  assert.equal(playerMatchesDoublesCategory({ category: 'B2', gender: 'K' }, fromWomenPreset), false);
  assert.equal(playerMatchesDoublesCategory({ category: 'B1', gender: 'M' }, openDouble), true);
  assert.equal(playerMatchesDoublesCategory({ category: 'B1', gender: 'K' }, openDouble), true);
});

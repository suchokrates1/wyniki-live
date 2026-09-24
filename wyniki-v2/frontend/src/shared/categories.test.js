import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignedTournamentCategoryId,
  doublesPartnerBands,
  extractCategoryCodeFromLabel,
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

test('hyphenated B3-B4 labels parse as B34', () => {
  assert.equal(extractCategoryCodeFromLabel('B3-B4 Kobiety'), 'B34');
  assert.equal(extractCategoryCodeFromLabel('B3–B4 Kobiet'), 'B34');
  assert.equal(extractCategoryCodeFromLabel('B3/4 Kobiety'), 'B34');
  assert.equal(planningDivisionFromGroupName('B3-B4 Kobiety'), 'B34K');
});

test('B3-B4 women label beats a leftover B3K preset', () => {
  const cat = { preset_key: 'B3K', label: 'B3-B4 Kobiety', hint_bands: ['B3', 'B4'] };
  assert.equal(tournamentCategoryDivisionKey(cat), 'B34K');
  assert.equal(playerMatchesTournamentCategory({ category: 'B4', gender: 'K' }, cat), true);
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

test('B1 Plus does not steal B1 men or women when those categories exist', () => {
  const plus = { id: 3, label: 'B1 Plus', hint_bands: ['B1'] };
  const siblings = [
    { id: 1, ...B1_WOMEN },
    { id: 2, ...B1_MEN },
    plus,
  ];
  const man = { category: 'B1', gender: 'M' };
  const woman = { category: 'B1', gender: 'K' };
  assert.equal(playerMatchesTournamentCategory(man, siblings[1], [], { siblings }), true);
  assert.equal(playerMatchesTournamentCategory(man, plus, [], { siblings }), false);
  assert.equal(playerMatchesTournamentCategory(woman, siblings[0], [], { siblings }), true);
  assert.equal(playerMatchesTournamentCategory(woman, plus, [], { siblings }), false);
});

test('B3-B4 women yields to a dedicated B3 women category', () => {
  const b3k = { id: 1, preset_key: 'B3K', label: 'B3 Kobiety', hint_bands: ['B3'] };
  const b34k = { id: 2, preset_key: 'B3K', label: 'B3-B4 Kobiety', hint_bands: ['B3', 'B4'] };
  const siblings = [b3k, b34k];
  assert.equal(playerMatchesTournamentCategory({ category: 'B3', gender: 'K' }, b3k, [], { siblings }), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B3', gender: 'K' }, b34k, [], { siblings }), false);
  assert.equal(playerMatchesTournamentCategory({ category: 'B4', gender: 'K' }, b34k, [], { siblings }), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B4', gender: 'K' }, b3k, [], { siblings }), false);
});

test('a player already drawn into B1 Plus stays out of B1 Men', () => {
  const plus = { id: 3, label: 'B1 Plus', hint_bands: ['B1'] };
  const man = { id: 10, category: 'B1', gender: 'M' };
  const siblings = [{ id: 2, ...B1_MEN }, plus];
  const assigned = { assignedCategoryId: 3, siblings };
  assert.equal(playerMatchesTournamentCategory(man, plus, [], assigned), true);
  assert.equal(playerMatchesTournamentCategory(man, siblings[0], [], assigned), false);
  assert.equal(assignedTournamentCategoryId(man, {
    groups: [{ name: 'B1 Plus', tournament_category_id: 3 }],
    assignments: { 10: 'B1 Plus' },
    categories: siblings,
  }), 3);
});

test('category filter keys map every label to one set of values', async () => {
  const { categoryFilterKey, categoryFilterKeys, categoryFilterLabel } = await import('./categories.js');
  assert.equal(categoryFilterKey('B1 Mężczyźni — Grupa A'), 'B1M');
  assert.equal(categoryFilterKey('B2 Kobiety'), 'B2K');
  assert.equal(categoryFilterKey('B1 Women'), 'B1K');
  assert.equal(categoryFilterKey('B3/B4 Men Doubles'), 'B34M-D');
  assert.equal(categoryFilterKey('B2 Men Doubles — Ćwierćfinał'), 'B2M-D');
  assert.equal(categoryFilterKey('B3/4 Mixed'), 'B34X');
  assert.equal(categoryFilterKey('B2', 'F'), 'B2K');
  assert.equal(categoryFilterKey('B4', 'M'), 'B4M');
  assert.equal(categoryFilterKey('Open'), '');
  assert.deepEqual(categoryFilterKeys(['B1M', 'B2M-D', 'B34X-D', 'B1M-D']), ['B1K', 'B1M', 'B2K', 'B2M', 'B3K', 'B3M', 'B4K', 'B4M', 'B1M-D', 'B2M-D', 'B34X-D']);
  assert.equal(categoryFilterLabel('B34M-D', { women: 'Women', men: 'Men', doubles: 'Doubles' }), 'B3/4 Men Doubles');
  assert.equal(categoryFilterLabel('B1K'), 'B1 Kobiety');
});

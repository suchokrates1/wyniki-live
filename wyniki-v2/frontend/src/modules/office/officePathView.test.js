import assert from 'node:assert/strict';
import test from 'node:test';
import { officePathRosterFacts } from './officePathView.js';
import { playerMatchesTournamentCategory, tournamentCategoryDivisionKey } from '../../shared/categories.js';

const B1K = { id: 1, label: 'B1 Kobiety', preset_key: 'B1K', hint_bands: ['B1'], is_active: 1 };
const B1M = { id: 2, label: 'B1 Mężczyźni', preset_key: 'B1M', hint_bands: ['B1'], is_active: 1 };
const PLUS = { id: 3, label: 'B1 Plus', preset_key: '', hint_bands: ['B1'], is_active: 1 };
const B34K = { id: 4, label: 'B3-B4 Kobiety', preset_key: 'B3K', hint_bands: ['B3', 'B4'], is_active: 1 };

test('path roster counts unique players in groups, not rematched class overlaps', () => {
  const players = [
    { id: 1, category: 'B1', gender: 'K' },
    { id: 2, category: 'B1', gender: 'M' },
    { id: 3, category: 'B1', gender: 'K' },
    { id: 4, category: 'B4', gender: 'K' },
  ];
  const facts = officePathRosterFacts({
    categories: [B1K, B1M, PLUS, B34K],
    groups: [
      { name: 'B1 Kobiety', tournament_category_id: 1 },
      { name: 'B1 Mężczyźni', tournament_category_id: 2 },
      { name: 'B1 Plus', tournament_category_id: 3 },
      { name: 'B3-B4 Kobiety', tournament_category_id: 4 },
    ],
    players,
    assignments: { 1: 'B1 Kobiety', 2: 'B1 Mężczyźni', 3: 'B1 Plus', 4: 'B3-B4 Kobiety' },
    matchPlayer: (player, category) => playerMatchesTournamentCategory(player, category),
  });
  assert.equal(facts.singlesTotal, 4);
  assert.equal(facts.singlesAssigned, 4);
  assert.deepEqual(facts.missing, []);
});

test('B3-B4 women category matches B3 and B4 women even with a leftover B3K preset', () => {
  assert.equal(tournamentCategoryDivisionKey(B34K), 'B34K');
  assert.equal(playerMatchesTournamentCategory({ category: 'B3', gender: 'K' }, B34K), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B4', gender: 'K' }, B34K), true);
  assert.equal(playerMatchesTournamentCategory({ category: 'B3', gender: 'M' }, B34K), false);
});

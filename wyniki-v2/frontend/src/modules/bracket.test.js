import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBracketCategories,
  getKnockoutPodiumEntries,
  getKnockoutRoundKind,
  isFinalPhase,
  isQuarterfinalPhase,
  isSemifinalPhase,
} from './bracket.js';

test('Ćwierćfinał is not a final', () => {
  assert.equal(getKnockoutRoundKind('B1 Men — 02 Ćwierćfinał'), 'quarterfinal');
  assert.equal(isQuarterfinalPhase('B1 Men — 02 Ćwierćfinał'), true);
  assert.equal(isFinalPhase('B1 Men — 02 Ćwierćfinał'), false);
  assert.equal(isFinalPhase('B1 Men — Finał'), true);
  assert.equal(isFinalPhase('B1 Men — Consolation Finał'), true);
  assert.equal(isSemifinalPhase('B1 Men — 03 Półfinał'), true);
  assert.equal(isFinalPhase('B1 Men — 03 Półfinał'), false);
});

test('podium uses championship final, not quarterfinal or consolation', () => {
  const podium = getKnockoutPodiumEntries([
    { phase: 'B1 Men — 02 Ćwierćfinał', slots: [{ player1: 'A', player2: 'B', winner: 'A' }] },
    { phase: 'B1 Men — Consolation Finał', slots: [{ player1: 'C', player2: 'D', winner: 'C' }] },
    { phase: 'B1 Men — Finał', slots: [{ player1: 'E', player2: 'F', winner: 'E' }] },
    { phase: 'B1 Men — o 3. miejsce', slots: [{ player1: 'G', player2: 'H', winner: 'G' }] },
  ]);
  assert.equal(podium[0].player, 'E');
  assert.equal(podium[1].player, 'F');
  assert.equal(podium[2].player, 'G');
});

test('knockout without groups still creates a category', () => {
  const cats = buildBracketCategories({
    groups: [],
    knockout: {
      'B1 Men Doubles — Finał': [{ player1: 'A / B', player2: 'C / D', winner: 'A / B' }],
    },
  });
  assert.equal(cats.length, 1);
  assert.equal(cats[0].name, 'B1 Men Doubles');
  assert.equal(cats[0].knockout.length, 1);
});

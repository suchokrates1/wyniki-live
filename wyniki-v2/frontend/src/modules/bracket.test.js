import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getKnockoutFamily,
  buildBracketCategories,
  buildKnockoutTrees,
  compareBracketCategoryNames,
  getBracketCategoryLabel,
  getCategoryPodiumEntries,
  getGroupPodiumEntries,
  getKnockoutPodiumEntries,
  getKnockoutRoundKind,
  groupMatchWinner,
  isFinalPhase,
  isQuarterfinalPhase,
  isSemifinalPhase,
  knockoutSlotWinner,
  winnerFromSets,
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

function rrMatch(playerA, playerB, winner) {
  return { player_a: playerA, player_b: playerB, winner, sets: [{ g1: winner === playerA ? 4 : 0, g2: winner === playerB ? 4 : 0 }] };
}

test('round-robin podium waits until every group match is finished', () => {
  const standings = [
    { name: 'Ivan' },
    { name: 'Arato' },
    { name: 'Ewan' },
    { name: 'Mateusz' },
  ];
  const unfinished = {
    knockout: [],
    groups: [{ play_format: 'round_robin', standings, matches: [] }],
  };
  assert.equal(getCategoryPodiumEntries(unfinished).length, 0);
  assert.equal(getCategoryPodiumEntries({
    knockout: [],
    groups: [{
      play_format: 'round_robin',
      standings,
      matches: [
        rrMatch('Ivan', 'Arato', 'Ivan'),
        rrMatch('Ivan', 'Ewan', 'Ivan'),
        rrMatch('Ivan', 'Mateusz', 'Ivan'),
        rrMatch('Arato', 'Ewan', 'Arato'),
        rrMatch('Arato', 'Mateusz', 'Arato'),
      ],
    }],
  }).length, 0);

  const podium = getCategoryPodiumEntries({
    knockout: [],
    groups: [{
      play_format: 'round_robin',
      standings,
      matches: [
        rrMatch('Ivan', 'Arato', 'Ivan'),
        rrMatch('Ivan', 'Ewan', 'Ivan'),
        rrMatch('Ivan', 'Mateusz', 'Ivan'),
        rrMatch('Arato', 'Ewan', 'Arato'),
        rrMatch('Arato', 'Mateusz', 'Arato'),
        rrMatch('Ewan', 'Mateusz', 'Ewan'),
      ],
    }],
  });
  assert.equal(podium[0].player, 'Ivan');
  assert.equal(podium[1].player, 'Arato');
  assert.equal(podium[2].player, 'Ewan');
  assert.equal(getGroupPodiumEntries([{ play_format: 'knockout', standings: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }]).length, 0);
});

test('groups-knockout does not take medals from the table before the cup is finished', () => {
  const podium = getCategoryPodiumEntries({
    knockout: [
      { phase: 'B1 Men — Finał', slots: [{ player1: '1. B1 Men', player2: '2. B1 Men' }] },
      { phase: 'B1 Men — o 3. miejsce', slots: [{ player1: '3. B1 Men', player2: '4. B1 Men' }] },
    ],
    groups: [{
      play_format: 'groups_knockout',
      standings: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      matches: [
        rrMatch('A', 'B', 'A'),
        rrMatch('A', 'C', 'A'),
        rrMatch('A', 'D', 'A'),
        rrMatch('B', 'C', 'B'),
        rrMatch('B', 'D', 'B'),
        rrMatch('C', 'D', 'C'),
      ],
    }],
  });
  assert.equal(podium.length, 0);
});

test('knockout podium ignores placeholder winners before matches are played', () => {
  const podium = getKnockoutPodiumEntries([
    { phase: 'B1 Men — Finał', slots: [{ player1: 'Zwycięzca: Półfinał 1', player2: 'Zwycięzca: Półfinał 2', winner: 'Zwycięzca: Półfinał 1' }] },
    { phase: 'B1 Men — o 3. miejsce', slots: [{ player1: 'Przegrany: Półfinał 1', player2: 'Przegrany: Półfinał 2', winner: 'Przegrany: Półfinał 1' }] },
  ]);
  assert.equal(podium.length, 0);
});

test('B3-B4 women stays a combined category tab, not B3 only', () => {
  assert.equal(
    getBracketCategoryLabel('B3-B4 Kobiety', { womenLabel: 'Kobiety', menLabel: 'Mężczyźni' }),
    'B3/4 Kobiety',
  );
  assert.equal(
    getBracketCategoryLabel('B3/4 Kobiety', { womenLabel: 'Kobiety', menLabel: 'Mężczyźni' }),
    'B3/4 Kobiety',
  );
});

test('doubles categories get a distinct label and sort above singles', () => {
  const doubles = getBracketCategoryLabel('B1 Men Doubles', {
    womenLabel: 'Women',
    menLabel: 'Men',
    doublesLabel: 'Doubles',
  });
  const singles = getBracketCategoryLabel('B1 Men', {
    womenLabel: 'Women',
    menLabel: 'Men',
    doublesLabel: 'Doubles',
  });
  assert.equal(singles, 'B1 Men');
  assert.equal(doubles, 'B1 Men Doubles');
  const cats = buildBracketCategories({
    groups: [
      { name: 'B1 Men — Grupa A', standings: [] },
      { name: 'B1 Men Doubles — Grupa A', standings: [] },
      { name: 'B1 Women — Grupa A', standings: [] },
    ],
    knockout: {},
  }, {
    compareCategoryNames: (left, right) => compareBracketCategoryNames(left.name, right.name),
  });
  assert.deepEqual(cats.map((cat) => cat.name), [
    'B1 Men Doubles',
    'B1 Women',
    'B1 Men',
  ]);
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

test('knockout winner follows set games, not a stale stored winner', () => {
  const slot = {
    player1: 'Haskett',
    player2: 'Viglianti',
    winner: 'Viglianti',
    sets: [{ g1: 4, g2: 0 }, { g1: 4, g2: 1 }],
  };
  assert.equal(knockoutSlotWinner(slot), 'Haskett');
  assert.equal(winnerFromSets(slot.sets, slot.player1, slot.player2, slot.winner), 'Haskett');
});

test('group match winner follows set games', () => {
  const match = {
    player_a: 'Gordon',
    player_b: 'Diaz',
    winner: 'Diaz',
    sets: [{ g1: 5, g2: 4 }, { g1: 1, g2: 4 }, { g1: 10, g2: 3, stb: true }],
  };
  assert.equal(groupMatchWinner(match), 'Gordon');
});

test('podium uses set winner when stored winner is flipped', () => {
  const podium = getKnockoutPodiumEntries([
    { phase: 'B1 Men — Finał', slots: [{ player1: 'E', player2: 'F', winner: 'F', sets: [{ g1: 4, g2: 1 }, { g1: 4, g2: 0 }] }] },
    { phase: 'B1 Men — o 3. miejsce', slots: [{ player1: 'G', player2: 'H', winner: 'H', sets: [{ g1: 4, g2: 2 }, { g1: 4, g2: 1 }] }] },
  ]);
  assert.equal(podium[0].player, 'E');
  assert.equal(podium[1].player, 'F');
  assert.equal(podium[2].player, 'G');
});

test('knockout trees are left-to-right: QF then SF then Final, placement below', () => {
  const cats = buildBracketCategories({
    groups: [],
    knockout: {
      'B2 Men — 02 Ćwierćfinał': [{}, {}, {}, {}],
      'B2 Men — 03 Półfinał': [{}, {}],
      'B2 Men — Finał': [{}],
      'B2 Men — o 3. miejsce': [{}],
      'B2 Men — 06 Consolation Ćwierćfinał': [{}, {}],
      'B2 Men — 07 Consolation Półfinał': [{}, {}],
      'B2 Men — Consolation Finał': [{}],
      'B2 Men — Consolation o 3. miejsce': [{}],
    },
  });
  assert.deepEqual(cats[0].knockout.map((round) => round.phase), [
    'B2 Men — 02 Ćwierćfinał',
    'B2 Men — 03 Półfinał',
    'B2 Men — Finał',
    'B2 Men — o 3. miejsce',
    'B2 Men — 06 Consolation Ćwierćfinał',
    'B2 Men — 07 Consolation Półfinał',
    'B2 Men — Consolation Finał',
    'B2 Men — Consolation o 3. miejsce',
  ]);
  const trees = buildKnockoutTrees(cats[0].knockout);
  assert.equal(trees.length, 2);
  assert.deepEqual(trees[0].rounds.map((round) => round.phase), [
    'B2 Men — 02 Ćwierćfinał',
    'B2 Men — 03 Półfinał',
    'B2 Men — Finał',
  ]);
  assert.equal(trees[0].placement[0].phase, 'B2 Men — o 3. miejsce');
});

test('9-16 semi is not interleaved with the championship tree', () => {
  const cats = buildBracketCategories({
    groups: [],
    knockout: {
      'B1 Men — 03 Półfinał': [{}, {}],
      'B1 Men — 10 9–16 Półfinał': [{}, {}],
      'B1 Men — Finał': [{}],
    },
  });
  assert.deepEqual(cats[0].knockout.map((round) => round.phase), [
    'B1 Men — 03 Półfinał',
    'B1 Men — Finał',
    'B1 Men — 10 9–16 Półfinał',
  ]);
});

test('generated Vilnius-format phases fall into main, places and consolation families', () => {
  assert.equal(getKnockoutFamily('B2 Men — Ćwierćfinał'), 0);
  assert.equal(getKnockoutFamily('B2 Men — o 3. miejsce'), 0);
  assert.equal(getKnockoutFamily('B2 Men — o miejsca 5–8'), 1);
  assert.equal(getKnockoutFamily('B2 Men — o 7. miejsce'), 1);
  assert.equal(getKnockoutFamily('B1 Men — o miejsca 9–12'), 4);
  assert.equal(getKnockoutFamily('B1 Men — o 13. miejsce'), 5);
  assert.equal(getKnockoutFamily('B2 Men — Pocieszenie Półfinał'), 2);
  assert.equal(getKnockoutFamily('B2 Men — Pocieszenie o 5. miejsce'), 3);
  assert.equal(getKnockoutFamily('B1 Men — 08 Consolation 7. miejsce'), 3);
});

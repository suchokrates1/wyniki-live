import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildBracketCategories } from './bracket.js';
import { layoutKnockoutTrees } from './knockoutLayout.js';

const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/bracket-${id}.json`, import.meta.url), 'utf8'));
const category = (id, name) => buildBracketCategories(load(id)).find((entry) => entry.name === name);
const surname = (name) => String(name || '').split(' ').pop();
const cellText = (cell) => {
  if (!cell) return '·';
  if (cell.type === 'bye') return `${surname(cell.player)}+bye`;
  return `${surname(cell.slot.player1)}-${surname(cell.slot.player2)}`;
};
const shape = (tree) => tree.columns.map((column) => column.cells.map(cellText));

test('Wilno B1 Men: the main draw keeps its two byes and Runda 2 / Runda 3 stay out of it', () => {
  const { trees } = layoutKnockoutTrees(category(31, 'B1 Men').knockout);
  const main = trees.find((tree) => tree.kind === 'main');
  assert.deepEqual(shape(main), [
    ['Rizvi+bye', 'Cont-Mathew', 'Rantanen-Haxell', 'Pažarauskas-Caparrós', 'Verbliugevičius-Kallunki', 'Muller-Rivas', 'Shiozawa-Butrimas', 'Arbos+bye'],
    ['Rizvi-Mathew', 'Rantanen-Caparrós', 'Kallunki-Muller', 'Shiozawa-Arbos'],
    ['Rizvi-Caparrós', 'Kallunki-Shiozawa'],
    ['Rizvi-Kallunki'],
  ]);
  assert.equal(main.champion, 'Jani Kallunki');
  assert.equal(cellText({ type: 'match', slot: main.third.slot }), 'Caparrós-Shiozawa');
});

test('Wilno B1 Men: consolation and placement draws are trees of their own', () => {
  const { trees, extras } = layoutKnockoutTrees(category(31, 'B1 Men').knockout);
  const consolation = trees.filter((tree) => tree.kind === 'consolation');
  assert.deepEqual(shape(consolation[0]), [
    ['Stetten-Malicki', 'Ferreira-Parravano', 'Sudoł-Furuya', 'Wiebe-Tolak-Ciszewski'],
    ['Stetten-Parravano', 'Sudoł-Tolak-Ciszewski'],
    ['Parravano-Sudoł'],
  ]);
  assert.equal(cellText({ type: 'match', slot: consolation[0].third.slot }), 'Stetten-Tolak-Ciszewski');
  assert.deepEqual(shape(consolation[1]), [['Malicki-Ferreira', 'Furuya-Wiebe'], ['Malicki-Furuya']]);

  const placement = trees.filter((tree) => tree.kind === 'placement');
  const fiveToEight = placement.find((tree) => tree.places?.[0] === 5);
  assert.deepEqual(shape(fiveToEight), [['Mathew-Rantanen', 'Muller-Arbos'], ['Mathew-Arbos']]);
  assert.equal(cellText({ type: 'match', slot: fiveToEight.third.slot }), 'Rantanen-Muller');

  const nineToSixteen = placement.find((tree) => tree.places?.[0] === 9);
  assert.deepEqual(shape(nineToSixteen), [
    ['Cont+bye', 'Haxell-Pažarauskas', 'Verbliugevičius-Rivas', 'Butrimas+bye'],
    ['Cont-Pažarauskas', 'Verbliugevičius-Butrimas'],
    ['Cont-Butrimas'],
  ]);
  assert.equal(cellText({ type: 'match', slot: nineToSixteen.third.slot }), 'Pažarauskas-Verbliugevičius');

  assert.deepEqual(extras.map((extra) => cellText({ type: 'match', slot: extra.slot })), ['Haxell-Rivas']);
});

test('Giebułtów: semifinal → final with the 3rd-place match, other placings as extras', () => {
  const { trees, extras } = layoutKnockoutTrees(category(32, 'B2 Mężczyźni').knockout);
  assert.equal(trees.length, 1);
  assert.deepEqual(shape(trees[0]), [['Stopierzyński-Lipski', 'Wywiórski-Orchowski'], ['Stopierzyński-Orchowski']]);
  assert.equal(cellText({ type: 'match', slot: trees[0].third.slot }), 'Lipski-Wywiórski');
  assert.equal(extras.length, 2);
});

test('a lone final is a one-column tree', () => {
  const { trees, extras } = layoutKnockoutTrees(category(25, 'B1 Mężczyźni').knockout);
  assert.deepEqual(shape(trees[0]), [['Sudoł-Tolak-Ciszewski']]);
  assert.equal(trees[0].kind, 'main');
  assert.equal(extras.length, 0);
});

test('slots still waiting for a name are joined by position', () => {
  const knockout = [
    { phase: 'B1 — Ćwierćfinał', slots: [
      { player1: 'A A', player2: 'B B', sets: [{ g1: 4, g2: 1 }, { g1: 4, g2: 1 }] },
      { player1: 'C C', player2: 'D D', sets: [] },
      { player1: 'E E', player2: 'F F', sets: [] },
      { player1: 'G G', player2: 'H H', sets: [] },
    ] },
    { phase: 'B1 — Półfinał', slots: [
      { player1: 'A A', player2: 'Zwycięzca QF2', sets: [] },
      { player1: 'Zwycięzca QF3', player2: 'Zwycięzca QF4', sets: [] },
    ] },
    { phase: 'B1 — Finał', slots: [{ player1: 'Zwycięzca PF1', player2: 'Zwycięzca PF2', sets: [] }] },
  ];
  const { trees, extras } = layoutKnockoutTrees(knockout);
  assert.deepEqual(shape(trees[0]), [
    ['A-B', 'C-D', 'E-F', 'G-H'],
    ['A-QF2', 'QF3-QF4'],
    ['PF1-PF2'],
  ]);
  assert.equal(extras.length, 0);
});

test('every knockout match lands exactly once, in every category of three real tournaments', () => {
  for (const id of [31, 32, 25]) {
    for (const entry of buildBracketCategories(load(id))) {
      const { trees, extras } = layoutKnockoutTrees(entry.knockout);
      const seen = [];
      trees.forEach((tree) => {
        tree.columns.forEach((column) => column.cells.forEach((cell) => {
          if (cell?.type === 'match') seen.push(cell.slot);
        }));
        if (tree.third) seen.push(tree.third.slot);
        tree.columns.forEach((column, index) => {
          assert.equal(column.cells.length, 2 ** (tree.columns.length - 1 - index), `${id} ${entry.name}`);
        });
      });
      extras.forEach((extra) => seen.push(extra.slot));
      const all = entry.knockout.flatMap((round) => round.slots);
      assert.equal(seen.length, all.length, `${id} ${entry.name}`);
      assert.equal(new Set(seen).size, all.length, `${id} ${entry.name}`);
    }
  }
});

test('a doubles pair is the same pair whichever partner is named first', () => {
  const { trees, extras } = layoutKnockoutTrees(category(31, 'B1 Women Doubles').knockout);
  assert.equal(trees.length, 1);
  assert.deepEqual(trees[0].columns.map((column) => column.cells.filter((cell) => cell?.type === 'match').length), [2, 2, 1]);
  assert.ok(trees[0].third);
  assert.equal(extras.length, 0);
});

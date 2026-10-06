import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildBracketCategories } from './bracket.js';
import { byeCard, countryOf, groupView, matchCard, profileHref, seedMap, shortName } from './bracketCards.js';
import { roundLabel, styleText, treeGeometry } from './bracketGeometry.js';
import { championTitle } from './championTitle.js';
import { competitorKey, layoutKnockoutTrees } from './knockoutLayout.js';

const wilno = JSON.parse(readFileSync(new URL('./fixtures/bracket-31.json', import.meta.url), 'utf8'));
const b1men = buildBracketCategories(wilno).find((entry) => entry.name === 'B1 Men');
const players = {
  'Jani Kallunki': { player_id: 627, global_player_id: 175, country: 'FI' },
  'Naqi Rizvi': { player_id: 600, global_player_id: null, country: 'GB' },
  'Tracy Compton': { country: 'GB' },
  'Yvette Priestley': { country: 'GB' },
};

test('names shrink to fit a tree card: initial for one player, surnames for a pair', () => {
  assert.equal(shortName('Karolis Verbliugevičius'), 'K. Verbliugevičius');
  assert.equal(shortName('Yvette Priestley / Tracy Compton'), 'Priestley / Compton');
  assert.equal(shortName('Zwycięzca QF2'), 'Zwycięzca QF2');
});

test('a name links to the global profile, else the tournament entry, else nowhere', () => {
  assert.equal(profileHref('Jani Kallunki', players), '#players/global/175');
  assert.equal(profileHref('Naqi Rizvi', players), '#players/600');
  assert.equal(profileHref('Nobody Known', players), '');
  assert.equal(countryOf('Yvette Priestley / Tracy Compton', players), 'GB');
});

test('seeds are the group letter and place', () => {
  const seeds = seedMap(b1men.groups);
  assert.equal(seeds.get(competitorKey('Naqi Rizvi')), 'A1');
  assert.equal(seeds.get(competitorKey('Jani Kallunki')), 'E2');
  assert.equal(seeds.get(competitorKey('Lars Stetten')), 'G4');
});

test('a card bolds the winner and puts the tie-break on the loser of that set', () => {
  const card = matchCard({
    a: 'Naqi Rizvi',
    b: 'Rafał Sudoł',
    sets: [{ g1: 5, g2: 4, tb: 3 }, { g1: 5, g2: 4, tb: 1 }],
    winner: 'Naqi Rizvi',
  }, { players, pinKey: competitorKey('Rafał Sudoł') });
  assert.deepEqual(card.rows.map((row) => row.won), [true, false]);
  assert.deepEqual(card.rows[1].games.map((game) => `${game.v}${game.tb ? `(${game.tb})` : ''}`), ['4(3)', '4(1)']);
  assert.deepEqual(card.rows[0].games.map((game) => game.tb), ['', '']);
  assert.equal(card.pinned, true);
  assert.equal(card.rows[1].pinned, true);
});

test('a super tie-break shows its points without a tie-break mark', () => {
  const card = matchCard({ a: 'A A', b: 'B B', sets: [{ g1: 4, g2: 1 }, { g1: 1, g2: 4 }, { g1: 10, g2: 7, tb: 7, stb: true }], winner: 'A A' });
  assert.deepEqual(card.rows[1].games.map((game) => [game.v, game.tb, game.stb]), [[1, '', false], [4, '', false], [7, '', true]]);
});

test('a bye is one real row and an empty one', () => {
  const card = byeCard('Naqi Rizvi', { players });
  assert.equal(card.rows[0].short, 'Naqi Rizvi');
  assert.equal(card.rows[1].bye, true);
  assert.equal(card.winnerKey, competitorKey('Naqi Rizvi'));
});

test('a group view counts qualifiers from the draw, not from the table position', () => {
  const groupE = b1men.groups.find((group) => group.name.endsWith('Grupa E'));
  const view = groupView(groupE, { players }, { qualified: (key) => key === competitorKey('Jani Kallunki') });
  assert.equal(view.letter, 'E');
  assert.deepEqual(view.rows.map((row) => [row.pos, row.name, row.qualifies]), [
    [1, 'Nibin Mathew', false], [2, 'Jani Kallunki', true], [3, 'Hideki Furuya', false],
  ]);
  assert.equal(view.rows[1].href, '#players/global/175');
  assert.equal(view.matches.length, 3);
  assert.equal(view.matches[0].rows[0].tag !== undefined, true);
});

test('round names come from the shape of the tree', () => {
  const { trees } = layoutKnockoutTrees(b1men.knockout);
  const t = { final: 'Finał', semifinal: 'Półfinał', quarterfinal: 'Ćwierćfinał', roundOf: '1/{n} finału', round: 'Runda {n}', placeMatch: 'O {number}. miejsce' };
  const main = trees.find((tree) => tree.kind === 'main');
  assert.deepEqual(main.columns.map((_, index) => roundLabel(main, index, t)), ['1/8 finału', 'Ćwierćfinał', 'Półfinał', 'Finał']);
  const fiveToEight = trees.find((tree) => tree.kind === 'placement' && tree.places?.[0] === 5);
  assert.deepEqual(fiveToEight.columns.map((_, index) => roundLabel(fiveToEight, index, t)), ['Runda 1', 'O 5. miejsce']);
});

test('the pinned path lights the connectors the player walked and nothing else', () => {
  const { trees } = layoutKnockoutTrees(b1men.knockout);
  const main = trees.find((tree) => tree.kind === 'main');
  const pinKey = competitorKey('Jani Kallunki');
  const geometry = treeGeometry(main, { pinKey, seeds: seedMap(b1men.groups) }, {}, { champion: { name: 'Jani Kallunki' } });
  // 7 pairs drawn left of the final: 3 + 2 + 1 joins, each two halves and a stub, plus the champion line.
  const lit = geometry.conns.filter((conn) => conn.lit).length;
  assert.equal(lit, 3 * 2 + 1);
  assert.equal(geometry.cards.filter((entry) => entry.card.pinned).length, 4);
  assert.ok(geometry.champ && geometry.champ.y >= 0);
  assert.equal(geometry.cards.length, 8 + 4 + 2 + 1 + 1);
  assert.equal(styleText({ left: 4, borderTop: '2px solid red' }), 'left: 4px; border-top: 2px solid red');
});

test('the champion line follows the tournament rank, the category and the office', () => {
  const t = {
    titles: {
      world: { m: 'Mistrz świata {cat}', f: 'Mistrzyni świata {cat}', pm: 'Mistrzowie świata {cat}', pf: 'Mistrzynie świata {cat}' },
      national: { m: 'Mistrz {country} {cat}', f: 'Mistrzyni {country} {cat}' },
      nationalFallback: { m: 'Mistrz kraju {cat}' },
      open: { m: 'Zwycięzca {cat}', f: 'Zwyciężczyni {cat}' },
    },
    countries: { PL: 'Polski' },
  };
  assert.equal(championTitle({ title_scope: 'world' }, 'B1 Men', t), 'Mistrz świata B1');
  assert.equal(championTitle({ title_scope: 'world' }, 'B1 Women Doubles', t), 'Mistrzynie świata B1');
  assert.equal(championTitle({ title_scope: 'world' }, 'B3/B4 Men Doubles', t), 'Mistrzowie świata B3/4');
  assert.equal(championTitle({ title_scope: 'national', country: 'PL' }, 'B2 Kobiety', t), 'Mistrzyni Polski B2');
  assert.equal(championTitle({ title_scope: 'national', country: 'LT' }, 'B2 Mężczyźni', t), 'Mistrz kraju B2');
  assert.equal(championTitle({ title_scope: 'open' }, 'B1 Kobiety', t), 'Zwyciężczyni B1');
  assert.equal(championTitle({ title_scope: 'open', title_override: 'Puchar ATNiS' }, 'B1 Kobiety', t), 'Puchar ATNiS');
});

test('the Wilno B1 Men panel: places, how far each got, and the side draws', async () => {
  const { buildCategoryPanel } = await import('./bracketPanelModel.js');
  const t = {
    reachChampion: 'mistrz', reachPlace: '{place}. miejsce', reachConsolation: 'pocieszenie',
    final: 'Finał', semifinal: 'Półfinał', quarterfinal: 'Ćwierćfinał', roundOf: '1/{n} finału', round: 'Runda {n}', placeMatch: 'O {number}. miejsce',
    mainDraw: 'Drabinka główna', consolation: 'Turniej pocieszenia', placesTitle: 'O miejsca {from}–{to}', consolationPlaces: 'Pocieszenie: o miejsca {from}–{to}',
    winnerLine: 'Zwycięzca: {name}', titles: { world: { m: 'Mistrz świata {cat}' } },
  };
  const panel = buildCategoryPanel(b1men, { ...wilno, tournament: { title_scope: 'world' } }, { pinKey: competitorKey('Rafał Sudoł'), t });
  const row = (name) => panel.groups.flatMap((group) => group.rows).find((entry) => entry.name === name);
  assert.equal(panel.groups.length, 7);
  assert.equal(row('Jani Kallunki').reach.text, 'mistrz');
  assert.equal(row('Jani Kallunki').qualifies, true);
  assert.equal(row('Naqi Rizvi').reach.text, 'Finał · 2. miejsce');
  assert.equal(row('Carlos Arbos').reach.text, 'Ćwierćfinał · 5. miejsce');
  assert.equal(row('Renzo Del Cont').reach.text, '1/8 finału · 9. miejsce');
  assert.equal(row('Rafał Sudoł').reach.text, 'pocieszenie');
  assert.equal(row('Rafał Sudoł').qualifies, false);
  assert.equal(panel.champion.title, 'Mistrz świata B1');
  assert.deepEqual(panel.side.map((tree) => [tree.title, tree.open]), [
    ['Turniej pocieszenia', true],
    ['Pocieszenie: o miejsca 5–8', false],
    ['O miejsca 5–8', false],
    ['O miejsca 9–16', false],
  ]);
  assert.equal(panel.side[0].winnerLine, 'Zwycięzca: Luca Parravano');
  assert.equal(panel.extras.length, 1);
});

test('on a phone the tree comes as phases: a round with the next one, then the final alone', async () => {
  const { phaseGeometries } = await import('./bracketGeometry.js');
  const { trees } = layoutKnockoutTrees(b1men.knockout);
  const main = trees.find((tree) => tree.kind === 'main');
  const t = { final: 'Finał', semifinal: 'Półfinał', quarterfinal: 'Ćwierćfinał', roundOf: '1/{n} finału' };
  const phases = phaseGeometries(main, { seeds: seedMap(b1men.groups) }, t, { champion: { name: 'Jani Kallunki' } });
  assert.deepEqual(phases.map((phase) => phase.label), ['1/8 finału', 'Ćwierćfinał', 'Półfinał', 'Finał']);
  assert.equal(phases[0].geometry.cards.length, 8 + 4);
  assert.deepEqual(phases[1].geometry.labels.map((label) => label.text), ['Ćwierćfinał', 'Półfinał']);
  assert.equal(phases[3].geometry.cards.length, 2);
  assert.ok(phases[3].geometry.champ);
  assert.equal(phases[0].geometry.champ, null);
});

test('the phone final keeps the champion above it, inside the phone width', async () => {
  const { phaseGeometries, PHONE_GEOMETRY } = await import('./bracketGeometry.js');
  const { trees } = layoutKnockoutTrees(b1men.knockout);
  const main = trees.find((tree) => tree.kind === 'main');
  const final = phaseGeometries(main, {}, {}, { champion: { name: 'Jani Kallunki' } }).pop().geometry;
  assert.equal(final.champ.x, 0);
  assert.ok(final.champ.y + final.champ.height <= final.cards[0].y);
  assert.equal(final.width, PHONE_GEOMETRY.width);
});

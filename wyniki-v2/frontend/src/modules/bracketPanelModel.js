import { getCategoryPodiumEntries, groupShowsStandingsTable } from './bracket.js';
import { groupView, isDecidedName, profileHref, seedMap, slotCard } from './bracketCards.js';
import { GEOMETRY, phaseGeometries, roundLabel, treeGeometry } from './bracketGeometry.js';
import { championTitle } from './championTitle.js';
import { competitorKey, layoutKnockoutTrees } from './knockoutLayout.js';

// Everything one category's bracket panel shows, computed once per change of data, pin or language.

const fill = (text, values = {}) => String(text || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

function matchSides(match) {
  return match ? [match.player1, match.player2] : [];
}

function winnerAndLoser(card) {
  if (!card?.winnerKey) return [null, null];
  const loser = card.keys.find((key) => key !== card.winnerKey) || null;
  return [card.winnerKey, loser];
}

/** Final places the trees decide: the main draw 1-4, a "places 5-8" draw 5-8, and so on. */
export function placesFromTrees(trees, ctx = {}) {
  const places = new Map();
  trees.forEach((tree) => {
    const start = tree.kind === 'main' ? 1 : (tree.kind === 'placement' ? tree.places?.[0] : null);
    if (!start) return;
    const root = tree.columns[tree.columns.length - 1].cells[0];
    if (root?.type !== 'match') return;
    const [first, second] = winnerAndLoser(slotCard(root.slot, ctx));
    if (first) places.set(first, start);
    if (second) places.set(second, start + 1);
    if (tree.third) {
      const [third, fourth] = winnerAndLoser(slotCard(tree.third.slot, ctx));
      if (third) places.set(third, start + 2);
      if (fourth) places.set(fourth, start + 3);
    }
  });
  return places;
}

function keysInTree(tree) {
  const keys = new Set();
  tree.columns.forEach((column) => column.cells.forEach((cell) => {
    if (cell?.type === 'bye' && isDecidedName(cell.player)) keys.add(competitorKey(cell.player));
    if (cell?.type === 'match') matchSides(cell.slot).filter(isDecidedName).forEach((name) => keys.add(competitorKey(name)));
  }));
  if (tree.third) matchSides(tree.third.slot).filter(isDecidedName).forEach((name) => keys.add(competitorKey(name)));
  return keys;
}

/** How far each competitor of the main draw got, column by column. */
function furthestMainRound(tree, t) {
  const reach = new Map();
  if (!tree) return reach;
  tree.columns.forEach((column, index) => column.cells.forEach((cell) => {
    if (cell?.type !== 'match') return;
    matchSides(cell.slot).filter(isDecidedName).forEach((name) => reach.set(competitorKey(name), roundLabel(tree, index, t)));
  }));
  return reach;
}

/** The phone opens a tree on the latest round with a result: the current one, or the final once done. */
function lastPlayedColumn(tree) {
  let found = 0;
  tree.columns.forEach((column, index) => {
    if (column.cells.some((cell) => cell?.type === 'match' && (cell.slot?.sets || []).length)) found = index;
  });
  return found;
}

function treeTitle(tree, t) {
  if (tree.kind === 'main') return t.mainDraw || '';
  if (tree.kind === 'consolation') {
    return tree.places && tree.places[0] > 1 ? fill(t.consolationPlaces, { from: tree.places[0], to: tree.places[1] }) : (t.consolation || '');
  }
  return tree.places ? fill(t.placesTitle, { from: tree.places[0], to: tree.places[1] }) : (t.otherMatches || '');
}

export function buildCategoryPanel(cat, data = {}, { pinKey = '', t = {} } = {}) {
  const players = data?.players || {};
  const ctx = { players, seeds: seedMap(cat?.groups || []), pinKey, useShort: true, tagMode: 'seed' };
  const { trees, extras } = layoutKnockoutTrees(cat?.knockout || []);
  const main = trees.find((tree) => tree.kind === 'main') || null;
  const mainKeys = main ? keysInTree(main) : new Set();
  const places = placesFromTrees(trees, ctx);
  const reachRound = furthestMainRound(main, t);
  const consolationKeys = new Set(trees.filter((tree) => tree.kind === 'consolation').flatMap((tree) => [...keysInTree(tree)]));
  const hasKnockout = (cat?.knockout || []).length > 0;

  const reachOf = (key) => {
    if (places.get(key) === 1) return { text: t.reachChampion || '', tone: 'gold' };
    if (places.has(key)) {
      const round = reachRound.get(key);
      const place = fill(t.reachPlace, { place: places.get(key) });
      return { text: round ? `${round} · ${place}` : place, tone: 'main' };
    }
    if (reachRound.has(key)) return { text: reachRound.get(key), tone: 'main' };
    if (consolationKeys.has(key)) return { text: t.reachConsolation || '', tone: 'quiet' };
    return null;
  };

  const qualified = (key, index) => (mainKeys.size ? mainKeys.has(key) : hasKnockout && index < 2);
  const groups = (cat?.groups || [])
    .filter(groupShowsStandingsTable)
    .map((group) => groupView(group, ctx, { qualified, reachOf: hasKnockout ? reachOf : () => null }));

  const champion = main?.champion
    ? { name: main.champion, short: main.champion, href: profileHref(main.champion, players), title: championTitle(data?.tournament || {}, cat?.name, t) }
    : null;

  const treeViews = trees.map((tree, index) => {
    const geometry = treeGeometry(tree, ctx, t, { champion: tree === main ? champion : null });
    const phases = phaseGeometries(tree, ctx, t, { champion: tree === main ? champion : null });
    const tabletPhases = phaseGeometries(tree, ctx, t, { champion: tree === main ? champion : null, span: 3, layout: GEOMETRY });
    const pinnedHere = Boolean(pinKey) && keysInTree(tree).has(pinKey);
    const rootCell = tree.columns[tree.columns.length - 1].cells[0];
    const winner = tree.kind !== 'main' && rootCell?.type === 'match' ? slotCard(rootCell.slot, ctx).rows.find((row) => row.won) : null;
    return {
      key: `${tree.kind}-${index}`,
      kind: tree.kind,
      title: treeTitle(tree, t),
      winnerLine: winner ? fill(t.winnerLine, { name: winner.name }) : '',
      open: tree.kind === 'main' || pinnedHere,
      pinnedHere,
      geometry,
      phases,
      tabletPhases,
      startPhase: lastPlayedColumn(tree),
    };
  });

  const podium = getCategoryPodiumEntries(cat || {}).map((entry) => ({
    ...entry,
    href: profileHref(entry.player, players),
    short: entry.player,
  }));

  return {
    name: cat?.name || '',
    groups,
    hasGroups: groups.length > 0,
    main: treeViews.find((tree) => tree.kind === 'main') || null,
    side: treeViews.filter((tree) => tree.kind !== 'main'),
    extras: extras.map((extra) => ({ phase: extra.phase, card: slotCard(extra.slot, { ...ctx, tagMode: 'country', useShort: false }) })),
    champion,
    podium,
  };
}

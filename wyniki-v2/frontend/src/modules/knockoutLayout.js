import { getKnockoutFamily, getKnockoutRoundKind, knockoutSlotWinner } from './bracket.js';
import { isPendingCompetitorName } from '../shared/labelDisplay.js';

// Phase names are not to be trusted for structure: imported draws call a 5th-place match "Runda 2".
// Trees come from who went on: a match feeds the next one its winner plays, and a tree never
// shows its loser again. Slots still waiting for a name fall back to their position in the round before.

function decided(name) {
  const text = String(name || '').trim();
  return Boolean(text) && !isPendingCompetitorName(text);
}

// Doubles pairs come in either order between rounds ("A / B" in the semifinal, "B / A" in the final).
export function competitorKey(name) {
  return String(name || '').split('/').map((part) => part.trim().toLowerCase()).filter(Boolean).sort().join(' / ');
}

function sidesOf(match) {
  return [match.slot?.player1 || '', match.slot?.player2 || ''];
}

function winnerOf(match) {
  const [a, b] = sidesOf(match);
  if (!decided(a) || !decided(b)) return '';
  const winner = knockoutSlotWinner(match.slot);
  return winner === a || winner === b ? winner : '';
}

function loserOf(match) {
  const winner = winnerOf(match);
  if (!winner) return '';
  const [a, b] = sidesOf(match);
  return winner === a ? b : a;
}

function isConsolation(phase) {
  return /consolation|pocieszenie/i.test(String(phase || ''));
}

function placeRange(phase) {
  const range = String(phase || '').replace(/–/g, '-').match(/(\d+)\s*-\s*(\d+)/);
  return range ? [Number(range[1]), Number(range[2])] : null;
}

function flattenMatches(knockout) {
  const matches = [];
  knockout.forEach((round, roundIndex) => {
    (round.slots || []).forEach((slot, slotIndex) => {
      matches.push({
        id: `${roundIndex}:${slotIndex}`,
        phase: round.phase,
        roundIndex,
        slotIndex,
        roundSize: (round.slots || []).length,
        slot,
        family: getKnockoutFamily(round.phase),
        kind: getKnockoutRoundKind(round.phase),
      });
    });
  });
  return matches;
}

function growTree(root, matches, taken) {
  const used = new Set([root.id]);
  const players = new Set(sidesOf(root).filter(decided).map(competitorKey));
  const nodes = [{ match: root, depth: 0, pos: 0 }];
  const byes = [];

  const free = (match) => !taken.has(match.id) && !used.has(match.id);

  const byFlow = (node, player) => {
    const candidates = matches.filter((match) => free(match)
      && competitorKey(winnerOf(match)) === competitorKey(player)
      && !players.has(competitorKey(loserOf(match))));
    if (!candidates.length) return null;
    const rank = (match) => [
      match.family === node.match.family ? 0 : 1,
      match.roundIndex < node.match.roundIndex ? 0 : 1,
      Math.abs(node.match.roundIndex - match.roundIndex),
    ];
    return candidates.sort((left, right) => {
      const a = rank(left);
      const b = rank(right);
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
      }
      return 0;
    })[0];
  };

  const byPosition = (node, sideIndex) => {
    const before = matches
      .filter((match) => match.family === node.match.family
        && match.kind !== 'placement'
        && match.roundIndex < node.match.roundIndex
        && match.roundSize === node.match.roundSize * 2)
      .map((match) => match.roundIndex);
    if (!before.length) return null;
    const roundIndex = Math.max(...before);
    const wanted = node.match.slotIndex * 2 + sideIndex;
    const match = matches.find((entry) => entry.roundIndex === roundIndex && entry.slotIndex === wanted);
    return match && free(match) ? match : null;
  };

  for (let cursor = 0; cursor < nodes.length; cursor += 1) {
    const node = nodes[cursor];
    sidesOf(node.match).forEach((player, sideIndex) => {
      const feeder = decided(player) ? byFlow(node, player) : byPosition(node, sideIndex);
      const depth = node.depth + 1;
      const pos = node.pos * 2 + sideIndex;
      if (feeder) {
        used.add(feeder.id);
        sidesOf(feeder).filter(decided).forEach((name) => players.add(competitorKey(name)));
        nodes.push({ match: feeder, depth, pos });
      } else if (decided(player)) {
        byes.push({ player, depth, pos });
      }
    });
  }
  const maxDepth = Math.max(...nodes.map((node) => node.depth));
  return { root, nodes, byes: byes.filter((bye) => bye.depth <= maxDepth), used };
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  let best = '';
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

function shapeTree(grown, third) {
  const maxDepth = Math.max(...grown.nodes.map((node) => node.depth));
  const columns = [];
  for (let column = 0; column <= maxDepth; column += 1) {
    const depth = maxDepth - column;
    const cells = new Array(2 ** depth).fill(null);
    grown.nodes.filter((node) => node.depth === depth).forEach((node) => {
      cells[node.pos] = { type: 'match', phase: node.match.phase, slot: node.match.slot };
    });
    grown.byes.filter((bye) => bye.depth === depth).forEach((bye) => {
      if (!cells[bye.pos]) cells[bye.pos] = { type: 'bye', player: bye.player };
    });
    const phases = cells.filter((cell) => cell?.type === 'match').map((cell) => cell.phase);
    columns.push({ phase: mostCommon(phases), cells });
  }

  const phases = grown.nodes.map((node) => node.match.phase).concat(third ? [third.phase] : []);
  const consolation = phases.filter(isConsolation).length * 2 > phases.length;
  const ranges = phases.map(placeRange).filter(Boolean).map((range) => range.join('-'));
  const range = ranges.length ? mostCommon(ranges).split('-').map(Number) : null;
  const main = !consolation && grown.root.family === 0 && grown.root.kind === 'final';
  return {
    kind: main ? 'main' : (consolation ? 'consolation' : 'placement'),
    places: main ? [1, 4] : (range || (grown.root.kind === 'final' ? [1, 4] : null)),
    columns,
    third: third ? { phase: third.phase, slot: third.slot } : null,
    champion: winnerOf(grown.root),
    matchCount: grown.nodes.length + (third ? 1 : 0),
  };
}

function findThird(grown, matches, taken) {
  const children = grown.nodes.filter((node) => node.depth === 1).map((node) => node.match);
  if (children.length !== 2) return null;
  const losers = children.map(loserOf);
  if (losers.every(decided)) {
    const keys = losers.map(competitorKey);
    return matches.find((match) => !taken.has(match.id)
      && sidesOf(match).filter(decided).length === 2
      && sidesOf(match).every((name) => keys.includes(competitorKey(name)))) || null;
  }
  const rootPhase = String(grown.root.phase || '');
  const prefix = rootPhase.includes(' — ') ? rootPhase.split(' — ')[0] : '';
  const familyThird = matches.find((match) => !taken.has(match.id)
    && match.family === grown.root.family
    && /\b3\.\s*miejsce|3rd/i.test(match.phase)
    && isConsolation(match.phase) === isConsolation(rootPhase)
    && String(match.phase).startsWith(prefix));
  return familyThird || null;
}

/**
 * Every knockout tree of one category, drawn left to right.
 * columns[0] is the first round; each column has 2^depth cells (match, bye or null),
 * so cell i of a column feeds cell floor(i / 2) of the next one.
 * Matches no tree claims (a lone 13th-place match) come back in `extras`.
 */
export function layoutKnockoutTrees(knockout = []) {
  const matches = flattenMatches(knockout);
  const taken = new Set();
  const trees = [];

  const claim = (grown) => {
    grown.used.forEach((id) => taken.add(id));
    const third = findThird(grown, matches, taken);
    if (third) taken.add(third.id);
    trees.push(shapeTree(grown, third));
  };

  matches
    .filter((match) => match.kind === 'final')
    .sort((left, right) => left.family - right.family || left.roundIndex - right.roundIndex)
    .forEach((root) => {
      if (!taken.has(root.id)) claim(growTree(root, matches, taken));
    });

  for (;;) {
    const options = matches
      .filter((match) => !taken.has(match.id))
      .map((match) => growTree(match, matches, taken))
      .filter((grown) => grown.nodes.length > 1);
    if (!options.length) break;
    // Same size both ways round? The true root needs fewer byes: read backwards, a draw sprouts gaps.
    options.sort((left, right) => right.nodes.length - left.nodes.length
      || left.byes.length - right.byes.length
      || right.root.roundIndex - left.root.roundIndex);
    claim(options[0]);
  }

  const extras = matches
    .filter((match) => !taken.has(match.id))
    .map((match) => ({ phase: match.phase, slot: match.slot }));

  const order = { main: 0, consolation: 1, placement: 2 };
  trees.sort((left, right) => order[left.kind] - order[right.kind]
    || (left.places?.[0] ?? 99) - (right.places?.[0] ?? 99));
  return { trees, extras };
}


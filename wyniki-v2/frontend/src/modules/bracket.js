export function getGroupStandingsRows(group, siblingGroups = []) {
  const rows = Array.isArray(group?.standings) ? [...group.standings] : [];
  const maxRows = Math.max(0, ...siblingGroups.map((entry) => Array.isArray(entry?.standings) ? entry.standings.length : 0));
  while (rows.length < maxRows) rows.push({ _placeholder: true, _key: `placeholder-${group?.name || 'group'}-${rows.length}` });
  return rows;
}

function phaseSuffix(phase) {
  const text = String(phase || '').trim();
  if (!text) return '';
  if (!text.includes(' — ')) return text;
  return text.split(' — ').pop().trim();
}

export function getKnockoutRoundKind(phase) {
  const suffix = phaseSuffix(phase).toLowerCase();
  if (suffix.includes('ćwierć') || suffix.includes('cwierc') || suffix.includes('quarter')) return 'quarterfinal';
  if (suffix.includes('półfina') || suffix.includes('polfina') || suffix.includes('semif')) return 'semifinal';
  if (/(?:^|\s)fina[lł]/.test(suffix) || suffix.includes('final')) return 'final';
  if (/\d+\.\s*miejsce|3rd|3-4|5th|7th|11th/.test(suffix) || /o\s+\d+/.test(suffix)) return 'placement';
  return 'other';
}

export function isFinalPhase(phase) {
  return getKnockoutRoundKind(phase) === 'final';
}

export function isSemifinalPhase(phase) {
  return getKnockoutRoundKind(phase) === 'semifinal';
}

export function isQuarterfinalPhase(phase) {
  return getKnockoutRoundKind(phase) === 'quarterfinal';
}

export function isPlacementPhase(phase) {
  return getKnockoutRoundKind(phase) === 'placement';
}

export function getKnockoutPhaseClass(phase) {
  return {
    'bt-round--final': isFinalPhase(phase),
    'bt-round--semifinal': isSemifinalPhase(phase),
    'bt-round--quarterfinal': isQuarterfinalPhase(phase),
    'bt-round--placement': isPlacementPhase(phase),
  };
}

export function getKnockoutPlaceNumber(phase) {
  const match = String(phase || '').match(/o\s+(\d+)\.\s*miejsce/i);
  return match ? Number(match[1]) : null;
}

export function getKnockoutSlotLoser(slot) {
  const winner = knockoutSlotWinner(slot);
  if (!slot || !winner) return '';
  if (winner === slot.player1) return slot.player2 || '';
  if (winner === slot.player2) return slot.player1 || '';
  return '';
}

export function getKnockoutPodiumEntries(knockout = []) {
  const entries = [];
  const finalPhase = knockout.find((entry) => {
    const phase = String(entry.phase || '');
    return isFinalPhase(phase) && !/consolation/i.test(phase) && knockoutSlotWinner(entry.slots?.[0]);
  });
  const thirdPlacePhase = knockout.find((entry) => (
    getKnockoutPlaceNumber(entry.phase) === 3 && knockoutSlotWinner(entry.slots?.[0])
  ));
  const finalSlot = finalPhase?.slots?.[0];
  const finalWinner = knockoutSlotWinner(finalSlot);
  if (!finalWinner) return [];
  const secondPlace = getKnockoutSlotLoser(finalSlot);
  const thirdSlot = thirdPlacePhase?.slots?.[0];
  const thirdPlace = knockoutSlotWinner(thirdSlot);
  if (!secondPlace || !thirdPlace) return [];
  entries.push({ medal: '🥇', cls: 'bt-podium-item--gold', player: finalWinner, place: '1.' });
  entries.push({ medal: '🥈', cls: 'bt-podium-item--silver', player: secondPlace, place: '2.' });
  entries.push({ medal: '🥉', cls: 'bt-podium-item--bronze', player: thirdPlace, place: '3.' });
  return entries;
}

export function getGroupPodiumEntries(groups = []) {
  const tables = (groups || []).filter((group) => (
    groupShowsStandingsTable(group) && Array.isArray(group?.standings) && group.standings.length >= 3
  ));
  if (tables.length !== 1) return [];
  const top = tables[0].standings.slice(0, 3).filter((row) => row?.name && !row._placeholder);
  if (top.length < 3) return [];
  return [
    { medal: '🥇', cls: 'bt-podium-item--gold', player: top[0].name, place: '1.' },
    { medal: '🥈', cls: 'bt-podium-item--silver', player: top[1].name, place: '2.' },
    { medal: '🥉', cls: 'bt-podium-item--bronze', player: top[2].name, place: '3.' },
  ];
}

export function getCategoryPodiumEntries(category = {}) {
  const fromKnockout = getKnockoutPodiumEntries(category?.knockout || []);
  if (fromKnockout.length === 3) return fromKnockout;
  return getGroupPodiumEntries(category?.groups || []);
}

import {
  extractCategoryCodeFromLabel,
  formatCategoryDisplay,
  inferPlanningGenderFromLabel,
  isMixedSectionLabel,
} from '../shared/categories.js';

export function parseBracketCategory(name) {
  const rawName = String(name || '').trim();
  const baseName = rawName.split(' — ')[0].trim();
  const division = extractCategoryCodeFromLabel(baseName);
  const normalized = baseName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const doubles = /\b(doubles?|debl\w*|doppel|doppio|dobles|dvejet\w*)\b/.test(normalized);
  const sectionLabel = baseName
    .replace(/^B(?:\d(?:\/\d)?|\d{2})\s*/i, '')
    .replace(/\b(doubles?|debl\w*|doppel|doppio|dobles|dvejet\w*)\b/gi, '')
    .trim();
  let gender = '';
  const genderCode = inferPlanningGenderFromLabel(baseName) || inferPlanningGenderFromLabel(sectionLabel);
  if (isMixedSectionLabel(sectionLabel) || normalized.includes('mixed') || normalized.includes(' mix')) {
    gender = 'mixed';
  } else if (genderCode === 'K') gender = 'women';
  else if (genderCode === 'M') gender = 'men';
  return { rawName, baseName, division, gender, doubles };
}

export function getBracketCategoryLabel(name, {
  translateCategory = (value) => value,
  womenLabel = 'Women',
  menLabel = 'Men',
  mixedLabel = 'Mixed',
  doublesLabel = 'Doubles',
} = {}) {
  const parsed = parseBracketCategory(name);
  let label = '';
  if (parsed.gender === 'mixed' && parsed.division) {
    label = `${formatCategoryDisplay(parsed.division)} ${mixedLabel}`.trim();
  } else if (!parsed.division || !parsed.gender) {
    label = translateCategory(name);
  } else {
    const genderLabel = parsed.gender === 'women' ? womenLabel : menLabel;
    label = `${formatCategoryDisplay(parsed.division)} ${genderLabel}`.trim();
  }
  if (parsed.doubles && doublesLabel) {
    const already = label.toLowerCase().includes(String(doublesLabel).toLowerCase())
      || parseBracketCategory(label).doubles;
    if (!already) label = `${label} ${doublesLabel}`.trim();
  }
  return label;
}

export function compareBracketCategoryNames(leftName, rightName, { getCategoryLabel = (name) => String(name || ''), lang = 'pl' } = {}) {
  const left = parseBracketCategory(leftName);
  const right = parseBracketCategory(rightName);
  const leftDoubles = left.doubles ? 0 : 1;
  const rightDoubles = right.doubles ? 0 : 1;
  if (leftDoubles !== rightDoubles) return leftDoubles - rightDoubles;
  const leftNum = Number.parseInt(left.division.replace(/\D/g, ''), 10);
  const rightNum = Number.parseInt(right.division.replace(/\D/g, ''), 10);
  const safeLeftNum = Number.isFinite(leftNum) ? leftNum : Number.MAX_SAFE_INTEGER;
  const safeRightNum = Number.isFinite(rightNum) ? rightNum : Number.MAX_SAFE_INTEGER;
  if (safeLeftNum !== safeRightNum) return safeLeftNum - safeRightNum;

  const genderOrder = { women: 0, men: 1, mixed: 2, '': 3 };
  const leftGender = genderOrder[left.gender] ?? 3;
  const rightGender = genderOrder[right.gender] ?? 3;
  if (leftGender !== rightGender) return leftGender - rightGender;

  return getCategoryLabel(leftName).localeCompare(
    getCategoryLabel(rightName),
    lang || 'pl',
    { sensitivity: 'base', numeric: true }
  );
}

export function groupShowsStandingsTable(group) {
  return String(group?.play_format || 'groups_knockout') !== 'knockout';
}

export function categoryShowsStandingsTables(category) {
  return (category?.groups || []).some(groupShowsStandingsTable);
}

function normalizePhaseText(phase) {
  return String(phase || '').toLowerCase().replace(/–/g, '-');
}

export function getKnockoutFamily(phase) {
  const text = normalizePhaseText(phase);
  const consolation = text.includes('consolation');
  if (/13\s*-\s*16/.test(text)) return consolation ? 6 : 5;
  if (/9\s*-\s*16/.test(text)) return consolation ? 6 : 4;
  if (consolation && (/5\s*-\s*8/.test(text) || /7\.\s*miejsce/.test(text))) return 3;
  if (consolation) return 2;
  if (/5\s*-\s*8/.test(text) || /7\.\s*miejsce/.test(text)) return 1;
  return 0;
}

function knockoutRoundNumber(phase) {
  const suffix = phaseSuffix(phase);
  const namedRound = suffix.match(/runda\s+(\d+)/i);
  if (namedRound) return Number(namedRound[1]);
  const leading = suffix.match(/^(\d+)/);
  return leading ? Number(leading[1]) : 0;
}

function knockoutSortKey(phase) {
  const text = String(phase || '');
  const kind = getKnockoutRoundKind(text);
  // Tournated / tennis.lt draw: early rounds on the left, final on the right.
  const kindOrder = { other: 1, quarterfinal: 2, semifinal: 3, final: 4, placement: 5 };
  return [getKnockoutFamily(text), kindOrder[kind] ?? 6, knockoutRoundNumber(text), text];
}

export function winnerFromSets(sets, player1, player2, fallback = '') {
  if (!Array.isArray(sets) || !sets.length) return fallback || '';
  let wins1 = 0;
  let wins2 = 0;
  for (const set of sets) {
    const left = Number(set?.g1 ?? set?.a ?? 0);
    const right = Number(set?.g2 ?? set?.b ?? 0);
    if (left > right) wins1 += 1;
    else if (right > left) wins2 += 1;
  }
  if (wins1 > wins2) return player1 || '';
  if (wins2 > wins1) return player2 || '';
  return fallback || '';
}

export function knockoutSlotWinner(slot) {
  if (!slot) return '';
  return winnerFromSets(slot.sets, slot.player1, slot.player2, slot.winner || '');
}

export function groupMatchWinner(match) {
  if (!match) return '';
  return winnerFromSets(match.sets, match.player_a, match.player_b, match.winner || '');
}

export function buildKnockoutTrees(knockout = []) {
  const trees = [];
  const byFamily = new Map();
  for (const round of knockout) {
    const family = getKnockoutFamily(round.phase);
    if (!byFamily.has(family)) {
      const tree = { family, rounds: [], placement: [] };
      byFamily.set(family, tree);
      trees.push(tree);
    }
    const tree = byFamily.get(family);
    if (getKnockoutRoundKind(round.phase) === 'placement') tree.placement.push(round);
    else tree.rounds.push(round);
  }
  return trees.filter((tree) => tree.rounds.length || tree.placement.length);
}

export function buildBracketCategories(data, { compareCategoryNames = (left, right) => String(left.name || '').localeCompare(String(right.name || '')) } = {}) {
  if (!data) return [];
  const cats = new Map();
  for (const group of data.groups || []) {
    const sep = group.name.indexOf(' — ');
    const cat = sep > -1 ? group.name.substring(0, sep) : group.name;
    if (!cats.has(cat)) cats.set(cat, { name: cat, groups: [], knockout: [] });
    cats.get(cat).groups.push(group);
  }

  if (data.knockout) {
    for (const [phase, slots] of Object.entries(data.knockout)) {
      const sep = phase.indexOf(' — ');
      const prefix = sep > -1 ? phase.substring(0, sep) : phase.split(' ')[0];
      let attached = false;
      for (const [, cat] of cats) {
        if (cat.name === prefix || (sep === -1 && cat.name.startsWith(prefix))) {
          cat.knockout.push({ phase, slots });
          attached = true;
          break;
        }
      }
      if (!attached && prefix) {
        if (!cats.has(prefix)) cats.set(prefix, { name: prefix, groups: [], knockout: [] });
        cats.get(prefix).knockout.push({ phase, slots });
      }
    }
  }

  return [...cats.values()]
    .map((category) => ({
      ...category,
      knockout: [...category.knockout].sort((left, right) => {
        const leftKey = knockoutSortKey(left.phase);
        const rightKey = knockoutSortKey(right.phase);
        for (let index = 0; index < leftKey.length; index += 1) {
          if (leftKey[index] < rightKey[index]) return -1;
          if (leftKey[index] > rightKey[index]) return 1;
        }
        return 0;
      }),
    }))
    .sort(compareCategoryNames);
}

export function resolveActiveBracketCategory(categories = [], selectedName = '') {
  if (categories.length === 0) return { category: null, selectedName: '' };
  const selected = selectedName ? categories.find((category) => category.name === selectedName) : null;
  const category = selected || categories[0];
  return { category, selectedName: category.name };
}
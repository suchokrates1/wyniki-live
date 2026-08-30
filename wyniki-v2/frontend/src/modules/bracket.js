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
  if (!slot || !slot.winner) return '';
  if (slot.winner === slot.player1) return slot.player2 || '';
  if (slot.winner === slot.player2) return slot.player1 || '';
  return '';
}

export function getKnockoutPodiumEntries(knockout = []) {
  const entries = [];
  const finalPhase = knockout.find((entry) => {
    const phase = String(entry.phase || '');
    return isFinalPhase(phase) && !/consolation/i.test(phase) && entry.slots?.[0]?.winner;
  });
  const thirdPlacePhase = knockout.find((entry) => getKnockoutPlaceNumber(entry.phase) === 3 && entry.slots?.[0]?.winner);
  const finalSlot = finalPhase?.slots?.[0];
  if (!finalSlot?.winner) return [];
  const secondPlace = getKnockoutSlotLoser(finalSlot);
  const thirdPlace = thirdPlacePhase?.slots?.[0]?.winner || '';
  if (!secondPlace || !thirdPlace) return [];
  entries.push({ medal: '🥇', cls: 'bt-podium-item--gold', player: finalSlot.winner, place: '1.' });
  entries.push({ medal: '🥈', cls: 'bt-podium-item--silver', player: secondPlace, place: '2.' });
  entries.push({ medal: '🥉', cls: 'bt-podium-item--bronze', player: thirdPlace, place: '3.' });
  return entries;
}

import {
  extractCategoryCodeFromLabel,
  formatCategoryDisplay,
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
  const sectionLabel = baseName.replace(/^B(?:\d(?:\/\d)?|\d{2})\s*/i, '').trim();
  let gender = '';
  if (isMixedSectionLabel(sectionLabel) || normalized.includes('mixed') || normalized.includes(' mix')) {
    gender = 'mixed';
  } else if (normalized.includes('kobiet')) gender = 'women';
  else if (normalized.includes('mezczyzn') || normalized.includes(' men') || normalized.endsWith(' men')) gender = 'men';
  return { rawName, baseName, division, gender };
}

export function getBracketCategoryLabel(name, {
  translateCategory = (value) => value,
  womenLabel = 'Women',
  menLabel = 'Men',
  mixedLabel = 'Mixed',
} = {}) {
  const parsed = parseBracketCategory(name);
  if (parsed.gender === 'mixed' && parsed.division) {
    return `${formatCategoryDisplay(parsed.division)} ${mixedLabel}`.trim();
  }
  if (!parsed.division || !parsed.gender) return translateCategory(name);
  const genderLabel = parsed.gender === 'women' ? womenLabel : menLabel;
  return `${formatCategoryDisplay(parsed.division)} ${genderLabel}`.trim();
}

export function compareBracketCategoryNames(leftName, rightName, { getCategoryLabel = (name) => String(name || ''), lang = 'pl' } = {}) {
  const left = parseBracketCategory(leftName);
  const right = parseBracketCategory(rightName);
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

function knockoutSortKey(phase) {
  const text = String(phase || '');
  const consolation = /consolation/i.test(text) ? 1 : 0;
  const kindOrder = { quarterfinal: 1, semifinal: 2, final: 3, placement: 4, other: 5 };
  const kind = getKnockoutRoundKind(text);
  return [consolation, kindOrder[kind] ?? 5, text];
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
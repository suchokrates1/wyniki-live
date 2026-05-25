export function getGroupStandingsRows(group, siblingGroups = []) {
  const rows = Array.isArray(group?.standings) ? [...group.standings] : [];
  const maxRows = Math.max(0, ...siblingGroups.map((entry) => Array.isArray(entry?.standings) ? entry.standings.length : 0));
  while (rows.length < maxRows) rows.push({ _placeholder: true, _key: `placeholder-${group?.name || 'group'}-${rows.length}` });
  return rows;
}

export function isFinalPhase(phase) {
  const text = String(phase || '');
  return text.includes('Finał') && !text.includes('Półfinał');
}

export function isSemifinalPhase(phase) {
  return String(phase || '').includes('Półfinał');
}

export function isPlacementPhase(phase) {
  return /o\s+\d+\.\s*miejsce/i.test(String(phase || ''));
}

export function getKnockoutPhaseClass(phase) {
  return {
    'bt-round--final': isFinalPhase(phase),
    'bt-round--semifinal': isSemifinalPhase(phase),
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
  const finalPhase = knockout.find((entry) => isFinalPhase(entry.phase) && entry.slots?.[0]?.winner);
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

export function parseBracketCategory(name) {
  const rawName = String(name || '').trim();
  const baseName = rawName.split(' — ')[0].trim();
  const divisionMatch = baseName.match(/^B\d+\+?/i);
  const division = divisionMatch ? divisionMatch[0].toUpperCase() : '';
  const normalized = baseName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let gender = '';
  if (normalized.includes('kobiet')) gender = 'women';
  else if (normalized.includes('mezczyzn')) gender = 'men';
  return { rawName, baseName, division, gender };
}

export function getBracketCategoryLabel(name, {
  translateCategory = (value) => value,
  womenLabel = 'Women',
  menLabel = 'Men',
} = {}) {
  const parsed = parseBracketCategory(name);
  if (!parsed.division || !parsed.gender) return translateCategory(name);
  const genderLabel = parsed.gender === 'women' ? womenLabel : menLabel;
  return `${genderLabel} ${parsed.division}`;
}

export function compareBracketCategoryNames(leftName, rightName, { getCategoryLabel = (name) => String(name || ''), lang = 'pl' } = {}) {
  const left = parseBracketCategory(leftName);
  const right = parseBracketCategory(rightName);
  const leftNum = Number.parseInt(left.division.replace(/\D/g, ''), 10);
  const rightNum = Number.parseInt(right.division.replace(/\D/g, ''), 10);
  const safeLeftNum = Number.isFinite(leftNum) ? leftNum : Number.MAX_SAFE_INTEGER;
  const safeRightNum = Number.isFinite(rightNum) ? rightNum : Number.MAX_SAFE_INTEGER;
  if (safeLeftNum !== safeRightNum) return safeLeftNum - safeRightNum;

  const genderOrder = { women: 0, men: 1, '': 2 };
  const leftGender = genderOrder[left.gender] ?? 3;
  const rightGender = genderOrder[right.gender] ?? 3;
  if (leftGender !== rightGender) return leftGender - rightGender;

  return getCategoryLabel(leftName).localeCompare(
    getCategoryLabel(rightName),
    lang || 'pl',
    { sensitivity: 'base', numeric: true }
  );
}

export function buildBracketCategories(data, { compareCategoryNames = (left, right) => String(left.name || '').localeCompare(String(right.name || '')) } = {}) {
  if (!data || !data.groups) return [];
  const cats = new Map();
  for (const group of data.groups) {
    const sep = group.name.indexOf(' — ');
    const cat = sep > -1 ? group.name.substring(0, sep) : group.name;
    if (!cats.has(cat)) cats.set(cat, { name: cat, groups: [], knockout: [] });
    cats.get(cat).groups.push(group);
  }

  if (data.knockout) {
    for (const [phase, slots] of Object.entries(data.knockout)) {
      const sep = phase.indexOf(' — ');
      const prefix = sep > -1 ? phase.substring(0, sep) : phase.split(' ')[0];
      for (const [, cat] of cats) {
        if (cat.name === prefix || (sep === -1 && cat.name.startsWith(prefix))) {
          cat.knockout.push({ phase, slots });
          break;
        }
      }
    }
  }

  return [...cats.values()].sort(compareCategoryNames);
}

export function resolveActiveBracketCategory(categories = [], selectedName = '') {
  if (categories.length === 0) return { category: null, selectedName: '' };
  const selected = selectedName ? categories.find((category) => category.name === selectedName) : null;
  const category = selected || categories[0];
  return { category, selectedName: category.name };
}
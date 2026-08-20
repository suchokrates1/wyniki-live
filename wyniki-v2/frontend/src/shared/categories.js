const MIXED_SECTION_LABELS = new Set([
  'mixed',
  'mix',
  'mieszane',
  'mieszana',
  'mieszany',
  'misto',
  'mezclado',
  'melange',
]);

export function normalizeCategoryCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const cleaned = raw.replace(/[^A-Z0-9]/g, '');
  if (cleaned === 'K' || cleaned === 'M') return '';
  return cleaned;
}

export function normalizeMixedCategories(values) {
  const normalized = [];
  for (const value of values || []) {
    const code = normalizeCategoryCode(value);
    if (code && !normalized.includes(code)) normalized.push(code);
  }
  return normalized;
}

export function formatPlayerClassification(category) {
  const code = normalizeCategoryCode(category);
  if (code === 'B1' || code === 'B2' || code === 'B3' || code === 'B4') return code;
  return '';
}

export function inferMixedPlayerBands(tournamentCategories = []) {
  const bands = [];
  for (const cat of tournamentCategories || []) {
    if (cat?.is_active === 0) continue;
    const rawLabel = String(cat?.label || '');
    const label = rawLabel.toLowerCase();
    const hints = normalizeMixedCategories(cat?.hint_bands || []);
    const isMixed = label.includes('mixed')
      || label.replace(/\//g, ' ').split(/\s+/).includes('mix')
      || hints.length > 1
      || hints.includes('B34');
    if (!isMixed) continue;
    let effectiveHints = hints;
    if (!effectiveHints.length && rawLabel) {
      const code = normalizeCategoryCode(rawLabel.split(/\s+/)[0]);
      if (code) effectiveHints = [code];
    }
    for (const hint of effectiveHints) {
      if (!bands.includes(hint)) bands.push(hint);
    }
    if (effectiveHints.includes('B3') && effectiveHints.includes('B4') && !bands.includes('B34')) {
      bands.push('B34');
    }
  }
  return bands;
}

export function isMixedCategory(category, mixedCategories = []) {
  const code = normalizeCategoryCode(category);
  if (!code) return false;
  return normalizeMixedCategories(mixedCategories).includes(code);
}

export function isMixedSectionLabel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  const normalized = raw.replace(/\//g, '').replace(/-/g, ' ').trim();
  return MIXED_SECTION_LABELS.has(normalized);
}

export function formatCategoryDisplay(category) {
  const code = normalizeCategoryCode(category);
  if (code === 'B34') return 'B3/4';
  return code;
}

export function mixedCategoryDisplayLabel(category, mixedCategories = []) {
  const code = normalizeCategoryCode(category);
  if (!isMixedCategory(code, mixedCategories)) return '';
  return `${formatCategoryDisplay(code)} Mixed`;
}

export function extractCategoryCodeFromLabel(label) {
  const match = String(label || '').trim().match(/^B(?:\d(?:\/\d)?|\d{2})/i);
  return match ? normalizeCategoryCode(match[0]) : '';
}

export function planningDivisionKey(category, gender, mixedCategories = []) {
  const cat = normalizeCategoryCode(category);
  if (isMixedCategory(cat, mixedCategories)) return cat || 'NIEPRZYPISANI';
  const raw = String(gender || '').trim().toUpperCase();
  const normalizedGender = raw === 'K' || raw === 'F' || raw === 'W' ? 'K' : raw === 'M' ? 'M' : '';
  if (cat && normalizedGender) return `${cat}${normalizedGender}`;
  return cat || normalizedGender || 'NIEPRZYPISANI';
}

/** Infer K/M from a category or group label. Check women before men — "women" contains "men". */
export function inferPlanningGenderFromLabel(label) {
  const lower = String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    /\bwomen\b/.test(lower)
    || /\bwoman\b/.test(lower)
    || lower.includes('kobiet')
    || /\bfrau/.test(lower)
    || /\bdamen\b/.test(lower)
    || lower.includes('moter')
    || /\bdonne\b/.test(lower)
    || /\bmujeres\b/.test(lower)
    || /\bfemmes\b/.test(lower)
  ) return 'K';
  if (
    /\bmen\b/.test(lower)
    || /\bman\b/.test(lower)
    || lower.includes('mezczy')
    || lower.includes('manner')
    || /\bherren\b/.test(lower)
    || /\bvyrai\b/.test(lower)
    || /\buomini\b/.test(lower)
    || /\bhombres\b/.test(lower)
    || /\bhommes\b/.test(lower)
  ) return 'M';
  const upper = String(label || '').toUpperCase().trim();
  if (upper.endsWith('K')) return 'K';
  if (upper.endsWith('M')) return 'M';
  return '';
}

function playerBandMatches(playerCategory, bands) {
  const code = normalizeCategoryCode(playerCategory);
  const normalized = normalizeMixedCategories(bands);
  if (!code || !normalized.length) return false;
  if (normalized.includes(code)) return true;
  if (normalized.includes('B34') && (code === 'B3' || code === 'B4' || code === 'B34')) return true;
  if (code === 'B34' && (normalized.includes('B3') || normalized.includes('B4'))) return true;
  return false;
}

/** Canonical B1K/B1M/… key for a tournament category row (preset first). */
export function tournamentCategoryDivisionKey(category, mixedCategories = []) {
  if (!category) return '';
  const preset = String(category.preset_key || '').trim().toUpperCase();
  if (/^B\d{1,2}[KM]$/.test(preset)) return preset;

  const label = String(category.label || '');
  const hints = normalizeMixedCategories(category.hint_bands || []);
  const code = extractCategoryCodeFromLabel(label) || (hints.length === 1 ? hints[0] : '');
  const mixed = isMixedCategory(code, mixedCategories)
    || isMixedSectionLabel(label)
    || hints.length > 1
    || hints.includes('B34')
    || /mixed|\bmix\b|mieszan/i.test(label);

  if (mixed) {
    if (hints.includes('B34') || (hints.includes('B3') && hints.includes('B4'))) return 'B34';
    if (hints.length === 1) return hints[0];
    return code || hints[0] || '';
  }

  const gender = inferPlanningGenderFromLabel(label);
  if (code && gender) return `${code}${gender}`;
  if (preset) return preset;
  return code || gender || '';
}

/** True when a player's visual class + gender belongs in this tournament category. */
export function playerMatchesTournamentCategory(player, category, mixedCategories = []) {
  if (!player || !category) return false;
  const expected = tournamentCategoryDivisionKey(category, mixedCategories);
  if (!expected) return true;
  if (/^B\d{1,2}$/.test(expected)) {
    const hints = normalizeMixedCategories(category.hint_bands || []);
    return playerBandMatches(player.category, hints.length ? hints : [expected]);
  }
  return planningDivisionKey(player.category, player.gender, mixedCategories) === expected;
}

export function planningDivisionFromGroupName(groupName, mixedCategories = []) {
  const label = String(groupName || '').split(' — ')[0].split(' - ')[0].trim();
  const category = extractCategoryCodeFromLabel(label);
  const sectionLabel = label.replace(/^B(?:\d(?:\/\d)?|\d{2})\s*/i, '').trim();
  if (isMixedCategory(category, mixedCategories) || isMixedSectionLabel(sectionLabel)) {
    return category || '';
  }
  const gender = inferPlanningGenderFromLabel(label) || inferPlanningGenderFromLabel(sectionLabel);
  if (category && gender) return `${category}${gender}`;
  return category || gender || '';
}

/** Stable division label stored in DB and assignments (language-independent). */
export function planningStoredDivisionLabel(key, mixedCategories = []) {
  const value = String(key || '').toUpperCase();
  const mixedLabel = mixedCategoryDisplayLabel(value, mixedCategories);
  if (mixedLabel) return mixedLabel;
  const category = (value.match(/^B\d{1,2}/) || [''])[0];
  const gender = value.endsWith('K') ? 'Kobiety' : value.endsWith('M') ? 'Mężczyźni' : '';
  if (category && gender) return `${category} ${gender}`;
  return category || gender || 'Nieprzypisani';
}

const PLANNING_GROUP_SUFFIX_RE = /(?:grupa|gruppe|group|girone|grupo|poule)\s+([A-Z])\s*$/i;

export function planningGroupLetterFromName(groupName) {
  const raw = String(groupName || '');
  const suffix = (raw.includes(' — ') ? raw.split(' — ')[1] : raw.split(' - ')[1] || '').trim();
  const match = suffix.match(PLANNING_GROUP_SUFFIX_RE) || suffix.match(/^([A-Z])$/i);
  return match ? match[1].toUpperCase() : '';
}

/** Canonical group names for assignments and API payloads. */
export function planningStoredGroupNames(divisionKey, count = 1, mixedCategories = []) {
  const safeCount = Math.max(1, Math.min(8, Number(count || 1)));
  const label = planningStoredDivisionLabel(divisionKey, mixedCategories);
  if (!divisionKey) return [];
  if (safeCount === 1) return [label];
  return Array.from({ length: safeCount }, (_, index) => (
    `${label} — Grupa ${String.fromCharCode(65 + index)}`
  ));
}

/** Map any stored or translated group label to the canonical name for a division. */
export function planningResolveStoredGroupName(groupName, divisionKey, count, mixedCategories = []) {
  if (!groupName || !divisionKey) return '';
  const targets = planningStoredGroupNames(divisionKey, count, mixedCategories);
  if (targets.includes(groupName)) return groupName;
  const nameDivision = planningDivisionFromGroupName(groupName, mixedCategories);
  if (nameDivision !== divisionKey) return '';
  const letter = planningGroupLetterFromName(groupName);
  if (letter) {
    const index = letter.charCodeAt(0) - 65;
    return targets[index] || '';
  }
  return targets[0] || '';
}

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

export function planningDivisionFromGroupName(groupName, mixedCategories = []) {
  const label = String(groupName || '').split(' — ')[0].split(' - ')[0].trim();
  const category = extractCategoryCodeFromLabel(label);
  const sectionLabel = label.replace(/^B(?:\d(?:\/\d)?|\d{2})\s*/i, '').trim();
  if (isMixedCategory(category, mixedCategories) || isMixedSectionLabel(sectionLabel)) {
    return category || '';
  }
  const upper = label.toUpperCase();
  const lower = label.toLowerCase();
  let gender = '';
  if (lower.includes('kob') || lower.includes('frau') || lower.includes('damen') || upper.endsWith('K')) gender = 'K';
  if (lower.includes('męż') || lower.includes('mez') || lower.includes('mężczy') || lower.includes('männer') || lower.includes('manner') || lower.includes('herren') || upper.endsWith('M')) gender = 'M';
  if (category && gender) return `${category}${gender}`;
  return category || gender || '';
}

/** Stable division label stored in DB and assignments (language-independent). */
export function planningStoredDivisionLabel(key, mixedCategories = []) {
  const value = String(key || '').toUpperCase();
  if (isMixedCategory(value, mixedCategories)) return 'B3/4 Mixed';
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

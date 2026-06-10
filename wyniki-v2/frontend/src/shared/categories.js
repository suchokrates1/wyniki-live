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
  if (lower.includes('kob') || upper.endsWith('K')) gender = 'K';
  if (lower.includes('męż') || lower.includes('mez') || lower.includes('mężczy') || upper.endsWith('M')) gender = 'M';
  if (category && gender) return `${category}${gender}`;
  return category || gender || '';
}

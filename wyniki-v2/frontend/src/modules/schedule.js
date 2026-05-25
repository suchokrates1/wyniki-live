import { formatTemplate } from '../shared/text.js';

export function getScheduleDays(data = null) {
  return Array.isArray(data?.days) ? data.days : [];
}

export function getScheduleMatchCount(data = null) {
  return getScheduleDays(data).reduce((total, day) => {
    const categories = Array.isArray(day?.categories) ? day.categories : [];
    return total + categories.reduce((sum, category) => sum + (Array.isArray(category?.matches) ? category.matches.length : 0), 0);
  }, 0);
}

export function getScheduleCurrentDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getScheduleDayBucket(day, today = getScheduleCurrentDate()) {
  const date = String(day?.date || '');
  if (!date) return 'future';
  if (date === today) return 'today';
  return date < today ? 'past' : 'future';
}

export function getSchedulePreparedDays(data = null, { buildGroups = () => [], currentDate = getScheduleCurrentDate() } = {}) {
  return getScheduleDays(data)
    .map((day) => {
      const groups = buildGroups(day);
      return {
        ...day,
        groups: Array.isArray(groups) ? groups : [],
        bucket: getScheduleDayBucket(day, currentDate),
      };
    })
    .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')))
    .filter((day) => day.groups.length > 0);
}

export function getSchedulePrimaryDays(preparedDays = []) {
  const order = { today: 0, future: 1, past: 2 };
  return [...preparedDays]
    .filter((day) => day.bucket !== 'past')
    .sort((left, right) => {
      const bucketOrder = (order[left.bucket] ?? 9) - (order[right.bucket] ?? 9);
      if (bucketOrder !== 0) return bucketOrder;
      return String(left?.date || '').localeCompare(String(right?.date || ''));
    });
}

export function getSchedulePastDays(preparedDays = []) {
  return [...preparedDays]
    .filter((day) => day.bucket === 'past')
    .sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')));
}

export function formatScheduleArchivedDaysLabel(count, { custom = '', lang = 'pl' } = {}) {
  if (typeof custom === 'string' && custom.includes('{count}')) {
    return formatTemplate(custom, { count });
  }
  if (typeof custom === 'string' && custom.trim()) {
    return `${custom} (${count})`;
  }
  if ((lang || 'pl') === 'pl') return `Zakończone dni (${count})`;
  return `Completed days (${count})`;
}

export function getScheduleSelectionKey(day, sortMode = 'court') {
  return `${day?.date || 'unknown'}::${sortMode === 'category' ? 'category' : 'court'}`;
}

export function getScheduleDomId(prefix, day, group) {
  const raw = `${prefix}-${day?.date || 'unknown'}-${group?.id || 'none'}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function flattenScheduleDay(day) {
  const matches = [];
  for (const category of Array.isArray(day?.categories) ? day.categories : []) {
    for (const match of Array.isArray(category?.matches) ? category.matches : []) {
      matches.push(match);
    }
  }
  return matches;
}

export function buildScheduleGroups(day, options = {}) {
  const mode = options.sortMode === 'category' ? 'category' : 'court';
  const query = normalizeScheduleText(options.search);
  const groups = new Map();

  for (const match of flattenScheduleDay(day)) {
    if (query && !scheduleMatchMatchesQuery(match, query, options)) continue;
    const meta = getScheduleGroupMeta(match, mode, options);
    if (!groups.has(meta.key)) {
      groups.set(meta.key, {
        id: meta.key,
        title: meta.label,
        sortOrder: meta.sortOrder,
        matches: [],
      });
    }
    groups.get(meta.key).matches.push(match);
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.matches.sort((left, right) => compareScheduleMatches(left, right, options));
  }

  result.sort((left, right) => {
    if (mode === 'court') {
      return (left.sortOrder - right.sortOrder)
        || left.title.localeCompare(right.title, options.lang || 'pl', { sensitivity: 'base' });
    }
    return left.title.localeCompare(right.title, options.lang || 'pl', { sensitivity: 'base' });
  });

  return result;
}

export function getScheduleGroupMeta(match, mode, options = {}) {
  if (mode === 'category') {
    const label = getScheduleCategoryLabel(match, options);
    return {
      key: `category-${normalizeScheduleText(match?.category_name || label || 'other') || 'other'}`,
      label,
      sortOrder: 9999,
    };
  }

  const label = getScheduleCourtTabLabel(match, options);
  const rawOrder = Number(match?.court_display_order);
  return {
    key: `court-${match?.court_id || normalizeScheduleText(label) || 'tbd'}`,
    label,
    sortOrder: Number.isFinite(rawOrder) ? rawOrder : 9999,
  };
}

export function getScheduleCourtTabLabel(match, { labels = {}, courtLabelPattern = 'Kort {court}', courtLabel = () => '' } = {}) {
  const rawLabel = String(match?.court_label || match?.court_id || '').trim();
  if (!rawLabel) return labels.courtTbd;

  const normalized = rawLabel
    .replace(/^(kort|court|platz|cancha|campo)\s*/i, '')
    .trim();

  if (!normalized) return courtLabel(match);
  return courtLabelPattern.replace('{court}', normalized);
}

export function getScheduleCategoryLabel(match, { labels = {}, translateCategory = (value) => value } = {}) {
  return translateCategory(match?.category_name || '') || labels.categoryTbd;
}

export function scheduleMatchMatchesQuery(match, query, options = {}) {
  const resolveName = options.resolveName || ((name) => name);
  const courtLabel = options.courtLabel || (() => '');
  const player1 = match?.player1_name || '';
  const player2 = match?.player2_name || '';
  const haystack = [
    player1,
    player2,
    resolveName(player1),
    resolveName(player2),
    courtLabel(match),
    getScheduleCategoryLabel(match, options),
    match?.notes_public || '',
  ].join(' ');
  return normalizeScheduleText(haystack).includes(query);
}

export function normalizeScheduleText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function compareScheduleMatches(left, right, { courtLabel = () => '', lang = 'pl' } = {}) {
  const timeLeft = left?.scheduled_time || '99:99';
  const timeRight = right?.scheduled_time || '99:99';
  if (timeLeft !== timeRight) return timeLeft.localeCompare(timeRight);

  const leftOrderRaw = Number(left?.court_display_order);
  const rightOrderRaw = Number(right?.court_display_order);
  const leftOrder = Number.isFinite(leftOrderRaw) ? leftOrderRaw : 9999;
  const rightOrder = Number.isFinite(rightOrderRaw) ? rightOrderRaw : 9999;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  const courtCompare = courtLabel(left).localeCompare(courtLabel(right), lang || 'pl', { sensitivity: 'base' });
  if (courtCompare !== 0) return courtCompare;

  const leftPlayers = `${left?.player1_name || ''} ${left?.player2_name || ''}`;
  const rightPlayers = `${right?.player1_name || ''} ${right?.player2_name || ''}`;
  return leftPlayers.localeCompare(rightPlayers, lang || 'pl', { sensitivity: 'base' });
}

export function formatScheduleDate(value, lang = 'pl') {
  if (!value) return '';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(lang || 'pl', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

export function formatScheduleTime(value, labels = {}) {
  return value || labels.timeTbd;
}

export function getScheduleStatusLabel(status, labels = {}) {
  const map = {
    draft: labels.statusDraft,
    planned: labels.statusPlanned,
    in_progress: labels.statusInProgress,
    completed: labels.statusCompleted,
  };
  return map[status] || status || labels.statusPlanned;
}
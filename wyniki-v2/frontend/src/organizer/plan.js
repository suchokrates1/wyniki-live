// The subscription as the organizer sees it: days left, the yearly tournament count.

export const WARN_DAYS = 14;

function isoToday(today) {
  return (today instanceof Date ? today : new Date()).toISOString().slice(0, 10);
}

/** Whole days from today to the end date (0 on the last day, negative once it passed). */
export function daysLeft(validUntil, today = new Date()) {
  if (!validUntil) return null;
  const end = Date.parse(`${validUntil}T00:00:00Z`);
  const now = Date.parse(`${isoToday(today)}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  return Math.round((end - now) / 86400000);
}

/** 'ok', 'ending' (within WARN_DAYS) or 'ended'; 'ok' too when there is no end date. */
export function planState(validUntil, today = new Date()) {
  const left = daysLeft(validUntil, today);
  if (left === null) return 'ok';
  if (left < 0) return 'ended';
  return left <= WARN_DAYS ? 'ending' : 'ok';
}

export function daysText(count) {
  if (count === 0) return 'dziś';
  if (count === 1) return 'jutro';
  return `za ${count} dni`;
}

export function tournamentsInYear(tournaments, year) {
  return (tournaments || []).filter((row) => String(row.start_date || '').startsWith(String(year))).length;
}

/** "Turnieje w 2026: 2 z 5", or '' without a limit. */
export function yearUsageText(series, year) {
  const limit = Number(series?.max_tournaments_per_year || 0);
  if (!limit) return '';
  return `Turnieje w ${year}: ${tournamentsInYear(series.tournaments, year)} z ${limit}`;
}

export function yearLimitReached(series, year) {
  const limit = Number(series?.max_tournaments_per_year || 0);
  return Boolean(limit) && tournamentsInYear(series.tournaments, year) >= limit;
}

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

/** The key and count for "today", "tomorrow" or "in n days". */
export function daysKey(count) {
  if (count === 0) return { key: 'today' };
  if (count === 1) return { key: 'tomorrow' };
  return { key: 'inDays', n: count };
}

export function tournamentsInYear(tournaments, year) {
  return (tournaments || []).filter((row) => String(row.start_date || '').startsWith(String(year))).length;
}

/** {used, limit} for the year, or null without a limit. */
export function yearUsage(series, year) {
  const limit = Number(series?.max_tournaments_per_year || 0);
  if (!limit) return null;
  return { used: tournamentsInYear(series.tournaments, year), limit };
}

export function yearLimitReached(series, year) {
  const usage = yearUsage(series, year);
  return Boolean(usage) && usage.used >= usage.limit;
}

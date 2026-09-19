const MAX_URL_LEN = 500;

export function sanitizeWatchUrl(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > MAX_URL_LEN) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password) return '';
  return text;
}

export function expandTournamentDays(startRaw, endRaw, { maxDays = 21 } = {}) {
  const start = parseIsoDate(startRaw);
  const end = parseIsoDate(endRaw) || start;
  if (!start) return [];
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const days = [];
  const cursor = new Date(first.getTime());
  while (cursor <= last && days.length < maxDays) {
    days.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function parseIsoDate(raw) {
  const text = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

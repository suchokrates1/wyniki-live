import { flattenScheduleDay, getScheduleCurrentDate, getScheduleDays } from './schedule.js';

const DONE_STATUSES = new Set(['completed', 'in_progress']);
const DONE_MATCH_STATUSES = new Set(['finished', 'in_progress']);

/** Feature switches the server stamps on the page (<meta name="bt-features" content="court-next ...">). */
export function pageFeatures(doc = globalThis.document) {
  const content = doc?.querySelector?.('meta[name="bt-features"]')?.getAttribute('content') || '';
  return new Set(content.split(/\s+/).filter(Boolean));
}

function samePair(match, liveNames) {
  const norm = (value) => String(value || '').trim().toLocaleLowerCase();
  const [a, b] = (liveNames || []).map(norm);
  if (!a || !b) return false;
  const p1 = norm(match?.player1_name);
  const p2 = norm(match?.player2_name);
  return (p1 === a && p2 === b) || (p1 === b && p2 === a);
}

function isPending(match) {
  if (match?.has_result) return false;
  if (DONE_STATUSES.has(match?.status)) return false;
  return !DONE_MATCH_STATUSES.has(match?.match_status);
}

/**
 * What the court plays next today, from the published schedule.
 *
 * Returns the next pending match on this court (skipping the one now being played),
 * `{ last: true }` when the court has matches today but none left, or null when the
 * schedule has nothing for this court today.
 */
export function nextMatchForCourt(data, courtId, { today = getScheduleCurrentDate(), liveNames = null } = {}) {
  const day = getScheduleDays(data).find((item) => String(item?.date || '') === today);
  if (!day || !courtId) return null;
  const onCourt = flattenScheduleDay(day).filter((match) => String(match?.court_id || '') === String(courtId));
  if (onCourt.length === 0) return null;
  const pending = onCourt
    .filter((match) => isPending(match) && !samePair(match, liveNames))
    .sort((left, right) => String(left?.scheduled_time || '99:99').localeCompare(String(right?.scheduled_time || '99:99')));
  return pending[0] || { last: true };
}

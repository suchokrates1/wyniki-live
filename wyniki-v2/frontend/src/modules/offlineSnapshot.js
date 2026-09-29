/* Last-known scores, kept so the page shows something when the network drops.
 *
 * The service worker deliberately never touches `/api/`, because caching a live
 * score would be worse than showing none. This keeps the staleness explicit
 * instead: the snapshot is stored with the time it arrived, and the page says
 * out loud that what you are reading is from then, not now.
 */

const STORAGE_KEY = 'wyniki.lastSnapshot';

/** Snapshots older than this are not worth showing — a day-old score is noise. */
export const MAX_SNAPSHOT_AGE_MS = 12 * 60 * 60 * 1000;

/** Strip the payload down to what the live view actually renders. */
function shrink(snapshot) {
  return {
    courts: snapshot?.courts || {},
    tournament_name: snapshot?.tournament_name ?? null,
  };
}

export function saveSnapshot(storage, snapshot, now = Date.now()) {
  if (!storage) return false;
  const courts = snapshot?.courts;
  // An empty snapshot would replace a good one with nothing to show.
  if (!courts || !Object.keys(courts).length) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...shrink(snapshot), savedAt: now }));
    return true;
  } catch {
    // Private mode, or the quota is full. Losing the fallback is not worth an error.
    return false;
  }
}

/** The stored snapshot, or null when there is none, it is unreadable, or too old. */
export function loadSnapshot(storage, now = Date.now(), maxAgeMs = MAX_SNAPSHOT_AGE_MS) {
  if (!storage) return null;
  let parsed;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const savedAt = Number(parsed?.savedAt);
  if (!Number.isFinite(savedAt) || savedAt > now) return null;
  if (now - savedAt > maxAgeMs) return null;
  const courts = parsed?.courts;
  if (!courts || typeof courts !== 'object' || !Object.keys(courts).length) return null;
  return { courts, tournament_name: parsed.tournament_name ?? null, savedAt };
}

export function clearSnapshot(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up */
  }
}

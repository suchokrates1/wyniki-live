/**
 * Stream links per day and court: the one shape the admin and the office both edit.
 *
 * The views keep the object in Alpine state and call these to read and change it in
 * place, so the screen updates; what differs between the two screens (which API they
 * save to, whether they track unsaved changes) stays in the views.
 */

export function emptyCourtStreams() {
  return { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] };
}

/** The API payload as the editor holds it, and whether one link serves every court. */
export function normalizeCourtStreams(payload = {}) {
  return {
    streams: {
      days: Array.isArray(payload.days) ? payload.days : [],
      today: payload.today || '',
      courts: Array.isArray(payload.courts) ? payload.courts : [],
      links: payload.links && typeof payload.links === 'object' ? payload.links : {},
      shared: payload.shared && typeof payload.shared === 'object' ? payload.shared : {},
      off_courts: Array.isArray(payload.off_courts) ? payload.off_courts.map(String) : [],
    },
    sharedAll: !!payload.shared_all_courts,
  };
}

export function streamUrl(streams, day, kortId) {
  return streams.links?.[day]?.[kortId] || '';
}

export function setStreamUrl(streams, day, kortId, value) {
  if (!streams.links[day]) streams.links[day] = {};
  streams.links[day][kortId] = value;
}

export function sharedStreamUrl(streams, day) {
  return streams.shared?.[day] || '';
}

export function setSharedStreamUrl(streams, day, value) {
  if (!streams.shared) streams.shared = {};
  streams.shared[day] = value;
}

export function isStreamCourtOn(streams, kortId) {
  return !(streams.off_courts || []).includes(String(kortId));
}

export function toggleStreamCourtOn(streams, kortId) {
  const id = String(kortId);
  const off = new Set(streams.off_courts || []);
  if (off.has(id)) off.delete(id);
  else off.add(id);
  streams.off_courts = [...off];
}

/** Switching to one link for all courts starts each day from the first link it had. */
export function fillSharedFromCourts(streams) {
  if (!streams.off_courts) streams.off_courts = [];
  if (!streams.shared) streams.shared = {};
  for (const day of streams.days || []) {
    if (streams.shared[day]) continue;
    const row = streams.links?.[day] || {};
    streams.shared[day] = Object.values(row).find((url) => String(url || '').trim()) || '';
  }
}

export function formatStreamDay(day, locale = 'pl') {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(day || '');
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  } catch {
    return String(day || '');
  }
}

export function isStreamToday(streams, day) {
  return String(day || '') === String(streams.today || '');
}

/** What both screens send when saving. */
export function courtStreamsPayload(streams, sharedAll) {
  return {
    shared_all_courts: !!sharedAll,
    shared: streams.shared || {},
    off_courts: streams.off_courts || [],
    links: streams.links || {},
  };
}

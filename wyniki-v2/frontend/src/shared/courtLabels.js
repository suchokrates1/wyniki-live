export function getSortedCourtIds(courts = {}) {
  return Object.entries(courts)
    .sort(([, left], [, right]) => {
      const tournamentLeft = String(left?.tournament_name || '');
      const tournamentRight = String(right?.tournament_name || '');
      if (tournamentLeft !== tournamentRight) return tournamentLeft.localeCompare(tournamentRight);
      const orderLeft = Number(left?.display_order || 0);
      const orderRight = Number(right?.display_order || 0);
      if (orderLeft !== orderRight) return orderLeft - orderRight;
      return String(left?.court_name || '').localeCompare(String(right?.court_name || ''));
    })
    .map(([id]) => id);
}

export function localizeCourtLabel(label, { forcePrefix = false, formatCourtLabel = (court) => String(court || '') } = {}) {
  const text = String(label || '').trim();
  if (!text) return '';
  const prefixed = text.match(/^(Kort|Court|Platz|Campo|Cancha)\s+(.+)$/i);
  if (prefixed) return formatCourtLabel(prefixed[2]);
  if (/^\d+$/.test(text)) return formatCourtLabel(text);
  if (forcePrefix) return formatCourtLabel(text);
  return text;
}

export function getCourtDisplayLabel(courts = {}, courtId, formatCourtLabel) {
  const court = courts[courtId] || {};
  const display = court.court_name || courtId;
  return localizeCourtLabel(display, { forcePrefix: true, formatCourtLabel });
}
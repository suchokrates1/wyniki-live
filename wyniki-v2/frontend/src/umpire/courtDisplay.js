const COURT_PREFIX = /^(court|kort|platz|campo|cancha|kortas)\s+/i;
const TOURNAMENT_COURT_ID = /^t\d+-(\d+)$/i;

export function extractCourtOrdinal(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;
  const afterBullet = value.includes('•') ? value.slice(value.lastIndexOf('•') + 1).trim() : value;
  const plain = afterBullet.replace(COURT_PREFIX, '').trim();
  if (/^\d+$/.test(plain)) return plain;
  const idMatch = TOURNAMENT_COURT_ID.exec(plain);
  return idMatch?.[1] || null;
}

export function courtDisplayName(rawName, courtId, formatCourtName) {
  const ordinal = extractCourtOrdinal(rawName) || extractCourtOrdinal(courtId);
  if (ordinal) return formatCourtName(ordinal);
  const sanitized = String(rawName || '')
    .substring(String(rawName || '').lastIndexOf('•') + 1)
    .trim();
  return sanitized || String(courtId || '');
}

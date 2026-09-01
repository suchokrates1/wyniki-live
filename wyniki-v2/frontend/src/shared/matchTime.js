export function toFiniteSeconds(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseTimestampSeconds(value) {
  if (value == null || value === '') return null;
  const numeric = toFiniteSeconds(value);
  if (numeric != null) {
    return numeric > 1e12 ? numeric / 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

export function matchElapsedSeconds(mt, nowMs = Date.now()) {
  if (!mt) return null;
  const started = parseTimestampSeconds(mt.started_ts);
  if (mt.running && started != null) {
    return Math.max(0, Math.floor(nowMs / 1000 - started));
  }
  const offset = toFiniteSeconds(mt.offset_seconds) || 0;
  if (mt.running) {
    const resume = parseTimestampSeconds(mt.resume_ts);
    const extra = resume != null ? Math.max(0, nowMs / 1000 - resume) : 0;
    return Math.max(0, Math.floor(offset + extra));
  }
  const frozen = toFiniteSeconds(mt.seconds);
  if (frozen && frozen > 0) return Math.max(0, Math.floor(frozen));
  return null;
}

export function formatMatchClock(seconds) {
  if (seconds == null) return null;
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function calcMatchTime(court, nowMs = Date.now()) {
  if (!court || !court.match_status?.active || !court.match_time) return null;
  return formatMatchClock(matchElapsedSeconds(court.match_time, nowMs));
}

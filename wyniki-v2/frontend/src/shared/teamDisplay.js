/** Canonical doubles pair labels: 'First Last / First Last'. */

export const TEAM_NAME_SEPARATOR = ' / ';
export const TEAM_WRAP_BREAK = '\u200B';

function stripWrapMarks(value) {
  return String(value || '').replaceAll(TEAM_WRAP_BREAK, '');
}

export function splitTeamDisplayName(value) {
  const raw = stripWrapMarks(value);
  const idx = raw.indexOf(TEAM_NAME_SEPARATOR);
  if (idx < 0) return null;
  const left = raw.slice(0, idx).trim();
  const right = raw.slice(idx + TEAM_NAME_SEPARATOR.length).trim();
  if (!left || !right) return null;
  return [left, right];
}

export function isTeamDisplayName(value) {
  return splitTeamDisplayName(value) != null;
}

export function lastNameToken(value) {
  const parts = stripWrapMarks(value).trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function formatTeamLabelForWrap(value) {
  const raw = stripWrapMarks(value);
  const split = splitTeamDisplayName(raw);
  if (!split) return raw;
  return `${split[0]}${TEAM_NAME_SEPARATOR}${TEAM_WRAP_BREAK}${split[1]}`;
}

export function competitorSearchTokens(value) {
  const raw = stripWrapMarks(value).trim();
  if (!raw) return [];
  const split = splitTeamDisplayName(raw);
  if (!split) return [raw];
  return [raw, split[0], split[1], `${split[1]}${TEAM_NAME_SEPARATOR}${split[0]}`];
}

export function registerCompetitorName(map, name) {
  const label = stripWrapMarks(name).trim();
  if (!label || !map) return map;
  // Pair labels must not occupy the last whitespace token (second surname).
  if (isTeamDisplayName(label)) return map;
  if (!label.includes(' ')) return map;
  const surname = lastNameToken(label);
  if (surname) map[surname] = label;
  return map;
}

export function abbreviatePersonName(name) {
  const parts = stripWrapMarks(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join(' ') || String(name || '');
  const surname = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((part) => `${part.charAt(0).toUpperCase()}.`).join(' ');
  return `${initials} ${surname}`;
}

export function abbreviateCompetitorName(name) {
  const split = splitTeamDisplayName(name);
  if (!split) return abbreviatePersonName(name);
  return `${abbreviatePersonName(split[0])}${TEAM_NAME_SEPARATOR}${abbreviatePersonName(split[1])}`;
}

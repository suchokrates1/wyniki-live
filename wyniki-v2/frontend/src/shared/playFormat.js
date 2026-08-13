export const PLAY_FORMAT_GROUPS_KNOCKOUT = 'groups_knockout';
export const PLAY_FORMAT_ROUND_ROBIN = 'round_robin';
export const PLAY_FORMAT_KNOCKOUT = 'knockout';
export const DEFAULT_PLAY_FORMAT = PLAY_FORMAT_GROUPS_KNOCKOUT;

export const PLAY_FORMATS = [
  PLAY_FORMAT_GROUPS_KNOCKOUT,
  PLAY_FORMAT_ROUND_ROBIN,
  PLAY_FORMAT_KNOCKOUT,
];

export function normalizePlayFormat(value) {
  const raw = String(value || '').trim();
  return PLAY_FORMATS.includes(raw) ? raw : DEFAULT_PLAY_FORMAT;
}

export function playFormatLabelKey(value) {
  const format = normalizePlayFormat(value);
  if (format === PLAY_FORMAT_ROUND_ROBIN) return 'planning.playFormatRoundRobin';
  if (format === PLAY_FORMAT_KNOCKOUT) return 'planning.playFormatKnockout';
  return 'planning.playFormatGroupsKnockout';
}

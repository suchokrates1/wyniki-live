export function suggestionScheduleId(suggestion) {
  if (!suggestion) return null;
  const value = suggestion.schedule_id ?? suggestion.id ?? null;
  return value == null ? null : value;
}

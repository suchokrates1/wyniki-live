export function formatDuration(durationMs) {
  const total = Math.max(0, Math.floor(Number(durationMs) || 0));
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / (1000 * 60)) % 60;
  const hours = Math.floor(total / (1000 * 60 * 60));
  const pad = (value) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function matchElapsedMs(state, nowMs) {
  if (!state) return 0;
  if (state.isMatchFinished) return state.matchDuration || 0;
  if (state.matchStartTime > 0) return Math.max(0, nowMs - state.matchStartTime);
  return 0;
}

export function matchTimerText(state, nowMs) {
  return formatDuration(matchElapsedMs(state, nowMs));
}

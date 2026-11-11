// How long the director-command poll waits after an attempt that brought no commands
// because it failed. A successful long poll already takes up to 20 s on the server.
const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 30_000;
// Without a court session nothing changes until the umpire enters the PIN.
const NO_SESSION_MS = 15_000;

/**
 * @param {number} status HTTP status of the refusal, 0 for a request that never got an answer
 * @param {number} failures consecutive failed attempts, this one included
 */
export function directorPollDelayMs(status, failures) {
  if (status === 401 || status === 403) return NO_SESSION_MS;
  const doubled = FIRST_RETRY_MS * 2 ** Math.max(0, Math.min(failures, 10) - 1);
  return Math.min(MAX_RETRY_MS, doubled);
}

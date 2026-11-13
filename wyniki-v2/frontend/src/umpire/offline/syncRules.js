export const MutationType = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  FINISH: 'FINISH',
  EVENT: 'EVENT',
  STATS: 'STATS',
});

export const MutationStatus = Object.freeze({
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  DONE: 'DONE',
  FAILED_AUTH: 'FAILED_AUTH',
  // refused for good (a 400 every time): kept for diagnosis, never sent again
  FAILED: 'FAILED',
});

// How many times a request the server answers with a plain refusal is tried.
export const MAX_REFUSED_ATTEMPTS = 5;

export function classifyHttp(status) {
  // api.js turns timeouts and failed fetches into status 0. Safari (and many venue
  // networks) still report navigator.onLine === true in that case, so a live sync
  // that only queues on !online() would drop the point. Treat "no HTTP answer" as
  // retryable the same way as a 5xx.
  if (!status) return 'RETRY';
  if (status === 401) return 'AUTH';
  if (status === 403 || status === 404) return 'DROP';
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return 'RETRY';
  if (status >= 200 && status < 300) return 'OK';
  return 'FAIL';
}

export function isRetryableStatus(status) {
  return classifyHttp(status) === 'RETRY';
}

export function shouldDropStale(status) {
  return classifyHttp(status) === 'DROP';
}

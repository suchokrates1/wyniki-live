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
});

export function classifyHttp(status) {
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

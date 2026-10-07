// The organizer's panel and its sign-in, as the admin's: back to where you were, but only
// ever inside the panel.

export const ORGANIZER_TOKEN_KEY = 'wyniki-organizer-token';
export const ORGANIZER_HOME = '/organizer';
export const ORGANIZER_LOGIN_PATH = '/organizer/login';

export function safeOrganizerNext(next) {
  const value = String(next || '');
  if (!/^\/organizer(?:[/?#]|$)/.test(value)) return ORGANIZER_HOME;
  if (/^\/organizer\/(?:login|invite)/.test(value) || /[\\\s]/.test(value)) return ORGANIZER_HOME;
  return value;
}

export function organizerLoginUrl({ next = '', reason = '' } = {}) {
  const params = new URLSearchParams();
  const target = safeOrganizerNext(next);
  if (target !== ORGANIZER_HOME) params.set('next', target);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query ? `${ORGANIZER_LOGIN_PATH}?${query}` : ORGANIZER_LOGIN_PATH;
}

const TIER_LABELS = { GS: 'Grand Slam', 1000: '1000', 500: '500', 250: '250', CH100: 'Challenger 100', CH50: 'Challenger 50' };
export const TIERS = Object.keys(TIER_LABELS);

export function tierLabel(tier) {
  return TIER_LABELS[tier] || tier || '';
}

/** "17–19.07.2026", "30.06–02.07.2026", "31.12.2026–02.01.2027" */
export function dateRange(start, end) {
  const [sy, sm, sd] = String(start || '').split('-');
  const [ey, em, ed] = String(end || start || '').split('-');
  if (!sy) return '';
  if (!ey || (sy === ey && sm === em && sd === ed)) return `${sd}.${sm}.${sy}`;
  if (sy === ey && sm === em) return `${sd}–${ed}.${em}.${ey}`;
  if (sy === ey) return `${sd}.${sm}–${ed}.${em}.${ey}`;
  return `${sd}.${sm}.${sy}–${ed}.${em}.${ey}`;
}

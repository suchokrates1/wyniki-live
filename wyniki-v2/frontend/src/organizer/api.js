// Every call of the organizer's panel: with the session, a 401 sends the person back to
// sign in, and a failed call becomes a text key the panel shows in the person's language.

import { storageGet } from '../shared/signInForm.js';
import { ORGANIZER_TOKEN_KEY, organizerLoginUrl } from './route.js';

const ERROR_KEYS = {
  'Subscription expired': 'errExpired',
  'Missing required fields': 'fillNameDates',
  'Name is required': 'errNameRequired',
  'last_name is required': 'lastNameRequired',
  'PIN must be 4 digits': 'errPin',
  'Player already in this tournament': 'errAlreadyEntered',
  'Office not open for this tournament': 'errOfficeClosed',
  'No valid players found': 'errNoPlayers',
  'Court count cannot be negative': 'errNegativeCourts',
  'Tournament limit reached': 'errYearLimit',
  'Court limit exceeded': 'errCourtLimit',
  'PNG, JPEG or WebP only': 'errLogoType',
  'File too large': 'errLogoSize',
};

export function toSignIn(reason) {
  try { sessionStorage.removeItem(ORGANIZER_TOKEN_KEY); } catch { /* private mode */ }
  const here = window.location.pathname + window.location.hash;
  window.location.replace(organizerLoginUrl({ next: reason === 'out' ? '' : here, reason }));
}

export async function organizerFetch(url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${storageGet(ORGANIZER_TOKEN_KEY) || ''}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) toSignIn('expired');
  return response;
}

/** A failed call: `key` names the text, `vars` fill it. */
export class CallError extends Error {
  constructor(key, vars = {}) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
}

export function errorKeyFor(raw) {
  if (String(raw).startsWith('Cannot remove active courts')) return 'errBusyCourt';
  return ERROR_KEYS[raw] || 'errSave';
}

/** JSON (or a form with a file) in, JSON out; throws CallError naming the text for the person. */
export async function call(url, method = 'GET', body) {
  const json = body !== undefined && !(body instanceof FormData);
  let response;
  try {
    response = await organizerFetch(url, {
      method,
      headers: json ? { 'Content-Type': 'application/json' } : undefined,
      body: json ? JSON.stringify(body) : body,
    });
  } catch {
    throw new CallError('errConnection');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new CallError(errorKeyFor(data.error || ''), { n: data.limit });
  return data;
}

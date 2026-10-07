// Every call of the organizer's panel: with the session, a 401 sends the person back to
// sign in, and a failed call becomes one sentence the panel can show.

import { storageGet } from '../shared/signInForm.js';
import { ORGANIZER_TOKEN_KEY, organizerLoginUrl } from './route.js';

const MESSAGES = {
  'Subscription expired': 'Abonament serii wygasł: panel działa tylko do odczytu.',
  'Missing required fields': 'Uzupełnij nazwę i obie daty.',
  'Name is required': 'Podaj imię i nazwisko.',
  'last_name is required': 'Podaj nazwisko.',
  'PIN must be 4 digits': 'PIN to cztery cyfry.',
  'Player already in this tournament': 'Ta osoba jest już zgłoszona do turnieju.',
  'Office not open for this tournament': 'Biuro otwiera się, gdy turniej trwa: włącz „Turniej trwa”.',
  'No valid players found': 'Nie rozpoznano żadnego zawodnika w tekście.',
  'Court count cannot be negative': 'Liczba kortów nie może być ujemna.',
  'Tournament limit reached': 'Limit turniejów w abonamencie na ten rok jest wykorzystany. Napisz do nas, żeby go zwiększyć.',
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

export class CallError extends Error {}

/** JSON in, JSON out; throws CallError with a sentence for the person. */
export async function call(url, method = 'GET', body) {
  let response;
  try {
    response = await organizerFetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CallError('Brak połączenia z serwerem. Spróbuj ponownie.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = String(data.error || '');
    const busy = raw.startsWith('Cannot remove active courts') ? 'Nie można usunąć kortu, na którym trwa mecz.' : '';
    const courts = raw === 'Court limit exceeded' ? `Abonament pozwala na najwyżej ${data.limit} kortów w turnieju.` : '';
    throw new CallError(MESSAGES[raw] || busy || courts || 'Nie udało się zapisać zmian. Spróbuj ponownie.');
  }
  return data;
}

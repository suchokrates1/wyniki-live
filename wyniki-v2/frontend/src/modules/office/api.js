export function officeAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * One call to this office's API, the way every view makes it.
 *
 * `view` is the office Alpine component (its slot and token header). A 401 gives back null
 * for the caller to stop on, and nothing else: office.js sees every 401 and decides about
 * the session, first following the tournament if it only moved to another slot. Logging
 * out here as well would end the session before that check could save it. Any other
 * answer comes back as status and body.
 */
function notifyOfficeSessionExpired() {
  if (typeof globalThis.window?.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new CustomEvent('office-session-expired'));
  }
}

export async function officeResponse(view, path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/office/${view.slot}${path}`, {
    method,
    headers: view.officeHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    notifyOfficeSessionExpired();
    return null;
  }
  if (response.status === 403 && /session|sesj/i.test(String(payload?.error || ''))) {
    notifyOfficeSessionExpired();
  }
  return { ok: response.ok, status: response.status, payload };
}

/**
 * What the office shows for a refused call.
 *
 * The server names the refusals a person at the desk can act on with a `code`; the office
 * has its own text for each, in the page's language. Without a code (or with one this
 * build does not know yet) the server's sentence is shown as before, and with no sentence
 * at all the office text under `failure`.
 */
export function officeErrorText(view, payload, failure) {
  const code = String(payload?.code || '').trim();
  const known = /^[a-z0-9_]+$/.test(code) ? view.ot(`errors.api.${code}`) : '';
  return known || payload?.error || (failure ? view.ot(failure) : '');
}

/**
 * The body of a successful call, or null after a 401. A refusal throws the server's error,
 * or the office text under `failure` when the server gave none, for the caller's toast.
 */
export async function officeJson(view, path, { failure, ...request } = {}) {
  const result = await officeResponse(view, path, request);
  if (!result) return null;
  if (!result.ok) throw new Error(officeErrorText(view, result.payload, failure));
  return result.payload;
}

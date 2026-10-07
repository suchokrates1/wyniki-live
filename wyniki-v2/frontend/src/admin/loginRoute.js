// The admin's sign-in is its own page. The panel sends you there without a session and
// the sign-in sends you back to where you were, but only ever inside the panel.

export const ADMIN_LOGIN_PATH = '/admin/login';
export const ADMIN_HOME = '/admin';

export function safeAdminNext(next) {
  const value = String(next || '');
  if (!/^\/admin(?:[/?#.]|$)/.test(value)) return ADMIN_HOME;
  if (value.startsWith(ADMIN_LOGIN_PATH) || /[\\\s]/.test(value)) return ADMIN_HOME;
  return value;
}

export function adminLoginUrl({ next = '', reason = '' } = {}) {
  const params = new URLSearchParams();
  const target = safeAdminNext(next);
  if (target !== ADMIN_HOME) params.set('next', target);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query ? `${ADMIN_LOGIN_PATH}?${query}` : ADMIN_LOGIN_PATH;
}

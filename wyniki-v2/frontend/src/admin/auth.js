import { adminLoginUrl } from './loginRoute.js';

const ADMIN_TOKEN_KEY = 'wyniki-admin-token';

function nativeFetch(input, init) {
  return window.fetch.call(window, input, init);
}

/** Whether this admin-page request should carry the administrator session. */
export function adminRequestCarriesSession(url, method = 'GET') {
  if (url === '/admin/api/auth') return false;
  if (url.startsWith('/admin/api/')) return true;
  const verb = String(method || 'GET').toUpperCase();
  if (url.startsWith('/api/overlay/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) return true;
  const path = url.split('?')[0];
  if (verb === 'GET' && path === '/api/overlay/stats/key') return true;
  return verb === 'GET' && /^\/api\/matches\/\d+$/.test(path);
}

export function installAdminFetchAuth() {
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!adminRequestCarriesSession(url, init.method)) return nativeFetch(input, init);
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers }).then((response) => {
      if (response.status === 401) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        window.dispatchEvent(new CustomEvent('admin-session-expired'));
      }
      return response;
    });
  };
}

export { ADMIN_TOKEN_KEY, nativeFetch };

/** Where the panel is now, so the sign-in can bring you back to the same section. */
function here() {
  return window.location.pathname + window.location.hash;
}

export function goToAdminLogin(reason = '') {
  window.location.replace(adminLoginUrl({ next: here(), reason }));
}

/** No session on this tab: the panel is not drawn at all, the sign-in page is. */
export function hasAdminSession() {
  try { return Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY)); } catch { return false; }
}

export function createAuthAdmin() {
  return {
    adminNeedsAuth: !hasAdminSession(),
    adminSessionEnding: false,
    passwordVisible: {
      officeEdit: false,
      officeNew: false,
      smtp: false,
    },

    toast: {
      show: false,
      message: '',
      type: 'info', // info, success, warning, error
    },

    handleAdminSessionExpired() {
      if (this.adminSessionEnding) return;
      this.adminSessionEnding = true;
      goToAdminLogin('expired');
    },

    logoutAdmin() {
      this.adminSessionEnding = true;
      try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* private mode */ }
      window.location.replace(adminLoginUrl({ reason: 'out' }));
    },

    // ===== TOAST =====
    showToast(message, type = 'info') {
      this.toast = { show: true, message, type };
      setTimeout(() => {
        this.toast.show = false;
      }, 3000);
    },
  };
}

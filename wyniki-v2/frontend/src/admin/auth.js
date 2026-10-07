import { adminLoginUrl } from './loginRoute.js';

const ADMIN_TOKEN_KEY = 'wyniki-admin-token';
const nativeFetch = window.fetch.bind(window);

export function installAdminFetchAuth() {
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const isProtected = url.startsWith('/admin/api/') || (
      url.startsWith('/api/overlay/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((init.method || 'GET').toUpperCase())
    );
    if (!isProtected || url === '/admin/api/auth') return nativeFetch(input, init);
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

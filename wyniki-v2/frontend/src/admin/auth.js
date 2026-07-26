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
    return nativeFetch(input, { ...init, headers });
  };
}

export { ADMIN_TOKEN_KEY, nativeFetch };

export function createAuthAdmin() {
  return {
    adminPassword: '',
    adminNeedsAuth: !sessionStorage.getItem(ADMIN_TOKEN_KEY),
    adminAuthError: '',

    toast: {
      show: false,
      message: '',
      type: 'info', // info, success, warning, error
    },

    async loginAdmin() {
      this.adminAuthError = '';
      const response = await nativeFetch('/admin/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.adminPassword }),
      });
      if (!response.ok) {
        this.adminAuthError = 'Nieprawidłowe hasło administratora.';
        return;
      }
      const payload = await response.json();
      sessionStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      this.adminPassword = '';
      this.adminNeedsAuth = false;
      await this.init();
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

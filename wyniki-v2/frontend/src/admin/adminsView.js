/**
 * System → Dostęp do panelu: the administrators, each with their own e-mail and password.
 * A new one gets a mailed link to set a password; with no mail out, the link shows here.
 */
import { memberStatus } from './seriesView.js';

const ERRORS = {
  'A valid e-mail is required': 'Podaj poprawny adres e-mail.',
  'Not your own account': 'Swojego konta nie odbierzesz.',
  'The last administrator stays': 'Musi zostać choć jeden administrator, który może się zalogować.',
};

export function createAdminsView() {
  return {
    adminAccounts: [],
    adminMe: null,
    adminSharedPassword: false,
    adminDraft: { email: '', name: '' },
    adminInvite: null,
    adminsError: '',

    adminStatus(row) { return memberStatus(row); },

    async _adminsCall(url, method = 'GET', body) {
      this.adminsError = '';
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.adminsError = ERRORS[data.error] || 'Nie udało się zapisać zmian. Spróbuj ponownie.';
        throw new Error(data.error || String(response.status));
      }
      return data;
    },

    async loadAdmins() {
      try {
        const data = await this._adminsCall('/admin/api/admins');
        this.adminAccounts = data.admins || [];
        this.adminMe = data.me ?? null;
        this.adminSharedPassword = !!data.shared_password;
      } catch (err) {
        console.error('Failed to load administrators:', err);
      }
    },

    async addAdmin() {
      if (!this.adminDraft.email.trim()) {
        this.adminsError = 'Podaj adres e-mail.';
        return;
      }
      try {
        this.adminInvite = await this._adminsCall('/admin/api/admins', 'POST', this.adminDraft);
        this.adminDraft = { email: '', name: '' };
        await this.loadAdmins();
      } catch { /* message shown */ }
    },

    async reinviteAdmin(row) {
      try {
        this.adminInvite = await this._adminsCall(`/admin/api/admins/${row.id}/invite`, 'POST');
      } catch { /* message shown */ }
    },

    async removeAdmin(row) {
      if (!window.confirm(`Odebrać ${row.email} uprawnienia administratora? Konto zostaje dla jego serii.`)) return;
      try {
        await this._adminsCall(`/admin/api/admins/${row.id}`, 'DELETE');
        await this.loadAdmins();
      } catch { /* message shown */ }
    },

    async copyAdminInvite() {
      try {
        await navigator.clipboard.writeText(this.adminInvite?.invite_url || '');
        this.showToast('Link skopiowany', 'success');
      } catch {
        this.showToast('Zaznacz link i skopiuj go ręcznie', 'warning');
      }
    },
  };
}

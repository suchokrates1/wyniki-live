/** Admin list of WhatsApp recipients for the umpire panic button. */
import { adminFetch } from './auth.js';

export function createPanicAdmin() {
  return {
    panicEnabled: true,
    panicRecipients: [],
    panicName: '',
    panicChatId: '',
    panicError: '',

    async loadPanic() {
      this.panicError = '';
      const response = await adminFetch('/admin/api/panic/settings');
      if (!response.ok) {
        this.panicError = 'Nie udało się wczytać listy.';
        return;
      }
      const data = await response.json();
      this.panicEnabled = !!data.enabled;
      this.panicRecipients = data.recipients || [];
    },

    async savePanicEnabled() {
      await adminFetch('/admin/api/panic/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: this.panicEnabled }),
      });
    },

    async addPanicRecipient() {
      this.panicError = '';
      const response = await adminFetch('/admin/api/panic/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.panicName, chat_id: this.panicChatId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        this.panicError = data.error || 'Nie udało się dodać.';
        return;
      }
      this.panicName = '';
      this.panicChatId = '';
      await this.loadPanic();
    },

    async togglePanicRecipient(row) {
      await adminFetch(`/admin/api/panic/recipients/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      await this.loadPanic();
    },

    async deletePanicRecipient(row) {
      await adminFetch(`/admin/api/panic/recipients/${row.id}`, { method: 'DELETE' });
      await this.loadPanic();
    },
  };
}

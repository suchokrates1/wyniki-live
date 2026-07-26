export function createOfficeQuickInfoView() {
  return {
    applyQuickInfo(info = {}) {
      this.quickInfoMessage = info?.message || '';
      this.quickInfoActive = info?.active !== false;
      this.quickInfoUpdatedAt = info?.updated_at || null;
    },

    formatQuickInfoTime(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      try {
        return new Intl.DateTimeFormat(this.officeLocale(), {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(date);
      } catch {
        return date.toLocaleString();
      }
    },

    async saveQuickInfo() {
      if (!this.token) return;
      this.quickInfoSaving = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/quick-info`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            message: this.quickInfoMessage,
            active: this.quickInfoActive,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.quickInfoFailed'));
        if (payload.quick_info) this.applyQuickInfo(payload.quick_info);
        this.quickInfoDirty = false;
        this.flushPendingOfficeRefresh();
        this.showToast(this.ot('toast.quickInfoSaved'), 'success');
      } catch (error) {
        console.error('Failed to save quick info:', error);
        this.showToast(error.message || this.ot('toast.quickInfoError'), 'error');
      } finally {
        this.quickInfoSaving = false;
      }
    },

    async hideQuickInfo() {
      this.quickInfoActive = false;
      await this.saveQuickInfo();
    },
  };
}

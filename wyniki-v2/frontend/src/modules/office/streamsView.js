export function createOfficeStreamsView() {
  return {
    courtStreams: { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] },
    streamsSharedAll: false,
    streamsDirty: false,
    streamsSaving: false,
    streamsLoaded: false,

    applyCourtStreams(payload = {}) {
      this.courtStreams = {
        days: Array.isArray(payload.days) ? payload.days : [],
        today: payload.today || '',
        courts: Array.isArray(payload.courts) ? payload.courts : [],
        links: payload.links && typeof payload.links === 'object' ? payload.links : {},
        shared: payload.shared && typeof payload.shared === 'object' ? payload.shared : {},
        off_courts: Array.isArray(payload.off_courts) ? payload.off_courts.map(String) : [],
      };
      this.streamsSharedAll = !!payload.shared_all_courts;
      this.streamsLoaded = true;
      this.streamsDirty = false;
    },

    streamUrl(day, kortId) {
      return this.courtStreams.links?.[day]?.[kortId] || '';
    },

    setStreamUrl(day, kortId, value) {
      if (!this.courtStreams.links[day]) this.courtStreams.links[day] = {};
      this.courtStreams.links[day][kortId] = value;
      this.streamsDirty = true;
    },

    sharedStreamUrl(day) {
      return this.courtStreams.shared?.[day] || '';
    },

    setSharedStreamUrl(day, value) {
      if (!this.courtStreams.shared) this.courtStreams.shared = {};
      this.courtStreams.shared[day] = value;
      this.streamsDirty = true;
    },

    isStreamCourtOn(kortId) {
      return !(this.courtStreams.off_courts || []).includes(String(kortId));
    },

    toggleStreamCourtOn(kortId) {
      const id = String(kortId);
      const current = new Set(this.courtStreams.off_courts || []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      this.courtStreams.off_courts = [...current];
      this.streamsDirty = true;
    },

    toggleStreamsSharedAll() {
      this.streamsSharedAll = !this.streamsSharedAll;
      this.streamsDirty = true;
      if (!this.streamsSharedAll) return;
      if (!this.courtStreams.off_courts) this.courtStreams.off_courts = [];
      if (!this.courtStreams.shared) this.courtStreams.shared = {};
      for (const day of this.courtStreams.days || []) {
        if (this.courtStreams.shared[day]) continue;
        const row = this.courtStreams.links?.[day] || {};
        const first = Object.values(row).find((url) => String(url || '').trim());
        this.courtStreams.shared[day] = first || '';
      }
    },

    formatStreamDay(day) {
      const date = new Date(`${day}T12:00:00`);
      if (Number.isNaN(date.getTime())) return String(day || '');
      try {
        return new Intl.DateTimeFormat(this.officeLocale(), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(date);
      } catch {
        return String(day || '');
      }
    },

    isStreamToday(day) {
      return String(day || '') === String(this.courtStreams.today || '');
    },

    async loadCourtStreams() {
      if (!this.token) return;
      try {
        const response = await fetch(`/api/office/${this.slot}/court-streams`, {
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.streamsFailed'));
        if (payload.court_streams) this.applyCourtStreams(payload.court_streams);
      } catch (error) {
        console.error('Failed to load court streams:', error);
        this.showToast(error.message || this.ot('errors.streamsFailed'), 'error');
      }
    },

    async saveCourtStreams() {
      if (!this.token) return;
      this.streamsSaving = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/court-streams`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            shared_all_courts: !!this.streamsSharedAll,
            shared: this.courtStreams.shared || {},
            off_courts: this.courtStreams.off_courts || [],
            links: this.courtStreams.links || {},
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          const invalid = payload.error === 'invalid_url';
          throw new Error(invalid ? this.ot('toast.streamsInvalid') : (payload.error || this.ot('errors.streamsFailed')));
        }
        this.dashboardSeq = (this.dashboardSeq || 0) + 1;
        if (payload.court_streams) this.applyCourtStreams(payload.court_streams);
        this.streamsDirty = false;
        this.flushPendingOfficeRefresh();
        this.showToast(this.ot('toast.streamsSaved'), 'success');
      } catch (error) {
        console.error('Failed to save court streams:', error);
        this.showToast(error.message || this.ot('toast.streamsError'), 'error');
      } finally {
        this.streamsSaving = false;
      }
    },
  };
}

/** Court stream links per day: what the public site links to for each court. */

export function createCourtStreamsAdmin() {
  return {
      courtStreams: { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] },

      streamsSharedAll: false,

      streamsSaving: false,

      applyAdminCourtStreams(payload = {}) {
        this.courtStreams = {
          days: Array.isArray(payload.days) ? payload.days : [],
          today: payload.today || '',
          courts: Array.isArray(payload.courts) ? payload.courts : [],
          links: payload.links && typeof payload.links === 'object' ? payload.links : {},
          shared: payload.shared && typeof payload.shared === 'object' ? payload.shared : {},
          off_courts: Array.isArray(payload.off_courts) ? payload.off_courts.map(String) : [],
        };
        this.streamsSharedAll = !!payload.shared_all_courts;
      },

      adminStreamUrl(day, kortId) {
        return this.courtStreams.links?.[day]?.[kortId] || '';
      },

      setAdminStreamUrl(day, kortId, value) {
        if (!this.courtStreams.links[day]) this.courtStreams.links[day] = {};
        this.courtStreams.links[day][kortId] = value;
      },

      adminSharedStreamUrl(day) {
        return this.courtStreams.shared?.[day] || '';
      },

      setAdminSharedStreamUrl(day, value) {
        if (!this.courtStreams.shared) this.courtStreams.shared = {};
        this.courtStreams.shared[day] = value;
      },

      isAdminStreamCourtOn(kortId) {
        return !(this.courtStreams.off_courts || []).includes(String(kortId));
      },

      toggleAdminStreamCourtOn(kortId) {
        const id = String(kortId);
        const current = new Set(this.courtStreams.off_courts || []);
        if (current.has(id)) current.delete(id);
        else current.add(id);
        this.courtStreams.off_courts = [...current];
      },

      toggleAdminStreamsSharedAll() {
        this.streamsSharedAll = !this.streamsSharedAll;
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

      formatAdminStreamDay(day) {
        const date = new Date(`${day}T12:00:00`);
        if (Number.isNaN(date.getTime())) return String(day || '');
        try {
          return new Intl.DateTimeFormat('pl', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
        } catch {
          return String(day || '');
        }
      },

      isAdminStreamToday(day) {
        return String(day || '') === String(this.courtStreams.today || '');
      },

      async loadAdminCourtStreams(tournamentId) {
        if (!tournamentId) return;
        try {
          const response = await fetch(`/admin/api/tournaments/${tournamentId}/court-streams`);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Błąd ładowania linków transmisji');
          this.applyAdminCourtStreams(payload.court_streams || {});
        } catch (err) {
          console.error('Failed to load court streams:', err);
          this.showToast('Błąd ładowania linków transmisji', 'error');
        }
      },

      async saveAdminCourtStreams() {
        if (!this.editTournament.id) return;
        this.streamsSaving = true;
        try {
          const response = await fetch(`/admin/api/tournaments/${this.editTournament.id}/court-streams`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shared_all_courts: !!this.streamsSharedAll,
              shared: this.courtStreams.shared || {},
              off_courts: this.courtStreams.off_courts || [],
              links: this.courtStreams.links || {},
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error === 'invalid_url' ? 'Nieprawidłowy adres URL' : (payload.error || 'Błąd zapisu linków'));
          }
          this.applyAdminCourtStreams(payload.court_streams || {});
          this.showToast('Zapisano linki do transmisji', 'success');
        } catch (err) {
          console.error('Failed to save court streams:', err);
          this.showToast(err.message || 'Błąd zapisu linków transmisji', 'error');
        } finally {
          this.streamsSaving = false;
        }
      },
  };
}

/** Court stream links per day, edited from the tournament settings. The shape and the
    editing live in shared/courtStreams.js, which the office uses too. */

import {
  courtStreamsPayload,
  emptyCourtStreams,
  fillSharedFromCourts,
  formatStreamDay,
  isStreamCourtOn,
  isStreamToday,
  normalizeCourtStreams,
  setSharedStreamUrl,
  setStreamUrl,
  sharedStreamUrl,
  streamUrl,
  toggleStreamCourtOn,
} from '../shared/courtStreams.js';

export function createCourtStreamsAdmin() {
  return {
      courtStreams: emptyCourtStreams(),

      streamsSharedAll: false,

      streamsSaving: false,

      applyAdminCourtStreams(payload = {}) {
        const { streams, sharedAll } = normalizeCourtStreams(payload);
        this.courtStreams = streams;
        this.streamsSharedAll = sharedAll;
      },

      adminStreamUrl(day, kortId) { return streamUrl(this.courtStreams, day, kortId); },
      setAdminStreamUrl(day, kortId, value) { setStreamUrl(this.courtStreams, day, kortId, value); },
      adminSharedStreamUrl(day) { return sharedStreamUrl(this.courtStreams, day); },
      setAdminSharedStreamUrl(day, value) { setSharedStreamUrl(this.courtStreams, day, value); },
      isAdminStreamCourtOn(kortId) { return isStreamCourtOn(this.courtStreams, kortId); },
      toggleAdminStreamCourtOn(kortId) { toggleStreamCourtOn(this.courtStreams, kortId); },

      toggleAdminStreamsSharedAll() {
        this.streamsSharedAll = !this.streamsSharedAll;
        if (this.streamsSharedAll) fillSharedFromCourts(this.courtStreams);
      },

      formatAdminStreamDay(day) { return formatStreamDay(day, 'pl'); },
      isAdminStreamToday(day) { return isStreamToday(this.courtStreams, day); },

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
            body: JSON.stringify(courtStreamsPayload(this.courtStreams, this.streamsSharedAll)),
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

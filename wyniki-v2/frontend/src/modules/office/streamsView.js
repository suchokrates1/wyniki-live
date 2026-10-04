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
} from '../../shared/courtStreams.js';

/** The office's stream editor: the shared editing, plus tracking what is not saved yet. */
export function createOfficeStreamsView() {
  return {
    courtStreams: emptyCourtStreams(),
    streamsSharedAll: false,
    streamsDirty: false,
    streamsSaving: false,
    streamsLoaded: false,

    applyCourtStreams(payload = {}) {
      const { streams, sharedAll } = normalizeCourtStreams(payload);
      this.courtStreams = streams;
      this.streamsSharedAll = sharedAll;
      this.streamsLoaded = true;
      this.streamsDirty = false;
    },

    streamUrl(day, kortId) { return streamUrl(this.courtStreams, day, kortId); },
    sharedStreamUrl(day) { return sharedStreamUrl(this.courtStreams, day); },
    isStreamCourtOn(kortId) { return isStreamCourtOn(this.courtStreams, kortId); },
    isStreamToday(day) { return isStreamToday(this.courtStreams, day); },
    formatStreamDay(day) { return formatStreamDay(day, this.officeLocale()); },

    setStreamUrl(day, kortId, value) {
      setStreamUrl(this.courtStreams, day, kortId, value);
      this.streamsDirty = true;
    },

    setSharedStreamUrl(day, value) {
      setSharedStreamUrl(this.courtStreams, day, value);
      this.streamsDirty = true;
    },

    toggleStreamCourtOn(kortId) {
      toggleStreamCourtOn(this.courtStreams, kortId);
      this.streamsDirty = true;
    },

    toggleStreamsSharedAll() {
      this.streamsSharedAll = !this.streamsSharedAll;
      this.streamsDirty = true;
      if (this.streamsSharedAll) fillSharedFromCourts(this.courtStreams);
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
          body: JSON.stringify(courtStreamsPayload(this.courtStreams, this.streamsSharedAll)),
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

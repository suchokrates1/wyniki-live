// What a screen reader hears when a court's score changes.
//
// The heading of a court carries its whole score: a swipe lands there once. The live region
// under it only says what changed, then empties, so a swipe does not hear the score twice
// and a page that has just loaded does not read every court out loud.

/** How long a changed score stays in a court's live region before it empties again. */
export const ANNOUNCE_MS = 4000;

export function createCourtAnnouncementsView() {
  return {
    courtAnnouncements: {},
    _announceTimers: {},
    _lastSummaries: null,

    courtAnnouncement(courtId) {
      return this.courtAnnouncements[courtId] || '';
    },

    refreshCourtAnnouncements() {
      const summaries = {};
      for (const courtId of Object.keys(this.courts || {})) summaries[courtId] = this.getScoreSummary(courtId);
      const before = this._lastSummaries;
      this._lastSummaries = { lang: this.lang, summaries };
      // the first snapshot, or new words for the same score after a language change: nothing to say
      if (!before || before.lang !== this.lang) return;
      for (const [courtId, text] of Object.entries(summaries)) {
        const previous = before.summaries[courtId];
        if (text && previous !== undefined && previous !== text) this.announceCourt(courtId, text);
      }
    },

    announceCourt(courtId, text) {
      this.courtAnnouncements = { ...this.courtAnnouncements, [courtId]: text };
      clearTimeout(this._announceTimers[courtId]);
      this._announceTimers[courtId] = setTimeout(() => {
        this.courtAnnouncements = { ...this.courtAnnouncements, [courtId]: '' };
      }, ANNOUNCE_MS);
    },
  };
}

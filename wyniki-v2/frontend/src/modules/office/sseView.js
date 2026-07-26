export function createOfficeSseView() {
  return {
    connectOfficeSSE() {
      if (!this.token || typeof EventSource === 'undefined') return;
      this.stopOfficeSSE({ keepFallback: true });
      this.officeSseState = 'connecting';
      const source = new EventSource(`/api/office/${this.slot}/stream`);
      this.officeEventSource = source;

      source.addEventListener('connected', () => {
        this.officeSseFailures = 0;
        this.officeSseState = 'live';
        this.stopOfficeFallbackPoll();
      });
      source.addEventListener('office_invalidate', () => this.queueOfficeSSERefresh());
      source.onerror = () => {
        if (this.officeEventSource !== source) return;
        source.close();
        this.officeEventSource = null;
        this.officeSseFailures += 1;
        this.officeSseState = 'reconnecting';
        this.startOfficeFallbackPoll();
        const delay = Math.min(30000, 1000 * (2 ** Math.min(this.officeSseFailures, 5)));
        window.clearTimeout(this.officeSseReconnectTimer);
        this.officeSseReconnectTimer = window.setTimeout(() => this.connectOfficeSSE(), delay);
      };
    },

    stopOfficeSSE({ keepFallback = false } = {}) {
      if (this.officeEventSource) this.officeEventSource.close();
      this.officeEventSource = null;
      window.clearTimeout(this.officeSseReconnectTimer);
      window.clearTimeout(this.officeSseRefreshTimer);
      this.officeSseReconnectTimer = null;
      this.officeSseRefreshTimer = null;
      if (!keepFallback) this.stopOfficeFallbackPoll();
    },

    startOfficeFallbackPoll() {
      if (this.officeFallbackPollTimer || !this.isAuthenticated) return;
      const poll = () => {
        if (this.isAuthenticated && !document.hidden) this.refreshOfficeFromRemote();
      };
      poll();
      this.officeFallbackPollTimer = window.setInterval(poll, 12000);
    },

    stopOfficeFallbackPoll() {
      if (this.officeFallbackPollTimer) window.clearInterval(this.officeFallbackPollTimer);
      this.officeFallbackPollTimer = null;
    },

    queueOfficeSSERefresh() {
      window.clearTimeout(this.officeSseRefreshTimer);
      this.officeSseRefreshTimer = window.setTimeout(() => this.refreshOfficeFromRemote(), 200);
    },

    async refreshOfficeFromRemote() {
      if (this.officeHasUnsavedWork()) {
        this.pendingRemoteRefresh = true;
        return;
      }
      this.pendingRemoteRefresh = false;
      await this.loadDashboard(false);
      if (this.activeTab === 'planning') await this.loadOfficePlanningData();
    },

    async flushPendingOfficeRefresh() {
      if (!this.pendingRemoteRefresh || this.officeHasUnsavedWork()) return;
      await this.refreshOfficeFromRemote();
    },
  };
}

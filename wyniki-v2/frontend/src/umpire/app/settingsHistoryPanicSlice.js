import { diagnosticsClipboardText, deviceLabel, SYNC_STATUS_KEYS } from '../offline/diagnostics.js';
import { APP_VERSION } from '../offline/heartbeat.js';
import {
  formatHistoryDuration,
  formatHistoryScore,
  formatHistoryWhen,
} from '../offline/history.js';

export function createUmpireSettingsHistoryPanicSlice({ api, session }) {
  return {
    openPanic() {
      this.panicNote = '';
      this.panicStatus = '';
      this.dialog = 'panic';
    },

    async confirmPanic() {
      this.panicStatus = '';
      const court = session.getCourtSession();
      const result = await api.sendPanic({
        courtId: court?.courtId || this.pinCourt?.kort_id || this.pinCourt?.id || this.match?.state?.courtId || '',
        note: this.panicNote,
      });
      if (result.status === 429) {
        this.panicStatus = this.t('panicCooldown');
        return;
      }
      if (!result.ok) {
        this.panicStatus = this.t('panicFailed');
        return;
      }
      this.dialog = null;
      this.panicToast = this.t('panicSent');
    },

    openSettings() {
      this.settingsFrom = this.screen;
      this.diagnosticsCopyOk = false;
      this.go('settings');
    },

    openLanguageFromSettings() {
      this.settingsFrom = 'settings';
      this.go('language');
    },

    async loadHistory() {
      this.historyEntries = this._history ? await this._history.list() : [];
    },

    async openHistory() {
      await this.loadHistory();
      this.go('history');
    },

    openHistoryDetail(entry) {
      this.historyDetail = entry;
      this.go('historyDetail');
    },

    historyWhen(entry) {
      return formatHistoryWhen(entry);
    },

    historyScore(entry) {
      return formatHistoryScore(entry);
    },

    historyDuration(entry) {
      return formatHistoryDuration(entry);
    },

    async askDeleteHistory(entry) {
      if (!window.confirm(this.t('confirmDeleteMatch'))) return;
      await this._history?.remove(entry.clientMatchUuid);
      if (this.historyDetail?.clientMatchUuid === entry.clientMatchUuid) {
        this.historyDetail = null;
        this.go('history');
      }
      await this.loadHistory();
    },

    async askDeleteAllHistory() {
      if (!window.confirm(this.t('confirmDeleteAllMatches'))) return;
      await this._history?.clear();
      this.historyDetail = null;
      await this.loadHistory();
    },

    diagnosticsRows() {
      const snap = this._diagnostics.get();
      const statusKey = SYNC_STATUS_KEYS[snap.status] || 'syncIdle';
      return [
        { label: this.t('diagnosticsAppVersion'), value: APP_VERSION },
        { label: this.t('diagnosticsBackend'), value: location.origin },
        { label: this.t('diagnosticsDevice'), value: deviceLabel() },
        { label: this.t('diagnosticsLocale'), value: this.lang },
        { label: this.t('diagnosticsTimezone'), value: Intl.DateTimeFormat().resolvedOptions().timeZone || '' },
        { label: this.t('diagnosticsSyncStatus'), value: this.t(statusKey) || snap.status },
        {
          label: this.t('diagnosticsLastUpdate'),
          value: snap.updatedAt ? formatHistoryWhen({ startTime: snap.updatedAt }) : this.t('diagnosticsNever'),
        },
        { label: this.t('diagnosticsLastError'), value: snap.lastError || this.t('diagnosticsNoError') },
      ];
    },

    async copyDiagnostics() {
      const snap = this._diagnostics.get();
      const statusKey = SYNC_STATUS_KEYS[snap.status] || 'syncIdle';
      const text = diagnosticsClipboardText({
        appVersion: APP_VERSION,
        backend: location.origin,
        device: deviceLabel(),
        locale: this.lang,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        statusLabel: this.t(statusKey) || snap.status,
        updatedLabel: snap.updatedAt ? formatHistoryWhen({ startTime: snap.updatedAt }) : this.t('diagnosticsNever'),
        errorLabel: snap.lastError || this.t('diagnosticsNoError'),
      });
      try {
        await navigator.clipboard.writeText(text);
        this.diagnosticsCopyOk = true;
      } catch {
        this.diagnosticsCopyOk = false;
      }
    },
  };
}

export const SYNC_STATUS_KEYS = Object.freeze({
  IDLE: 'syncIdle',
  SYNCING: 'syncSyncing',
  SYNCED: 'syncSynced',
  FAILED: 'syncFailed',
  OFFLINE: 'syncOffline',
});

export function createDiagnostics({ now = () => Date.now() } = {}) {
  let snapshot = {
    status: 'IDLE',
    lastError: '',
    updatedAt: null,
  };

  return {
    record(status, error = '') {
      snapshot = {
        status,
        lastError: String(error || '').slice(0, 500),
        updatedAt: now(),
      };
    },

    get() {
      return { ...snapshot };
    },
  };
}

export function diagnosticsClipboardText({
  appVersion,
  backend,
  device,
  locale,
  timezone,
  statusLabel,
  updatedLabel,
  errorLabel,
}) {
  return [
    `App version: ${appVersion}`,
    `Backend URL: ${backend}`,
    `Device: ${device}`,
    `Locale: ${locale}`,
    `Timezone: ${timezone}`,
    `Last sync status: ${statusLabel}`,
    `Last sync update: ${updatedLabel}`,
    `Last sync error: ${errorLabel}`,
  ].join('\n');
}

export function deviceLabel(navigatorRef = globalThis.navigator) {
  return navigatorRef?.userAgent || 'web';
}

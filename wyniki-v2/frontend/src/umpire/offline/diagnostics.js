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
  const uaData = navigatorRef?.userAgentData;
  const model = String(uaData?.model || '').trim();
  const platform = String(uaData?.platform || '').trim();
  if (model) return `${platform} ${model}`.trim();

  const ua = String(navigatorRef?.userAgent || '');
  const android = ua.match(/Android[^;]*;\s*([^);]+)/i);
  if (android?.[1]) {
    const name = android[1].replace(/^Linux\s+/i, '').trim();
    if (name && name.toLowerCase() !== 'wv') return name;
  }
  if (platform) return platform;
  return ua || 'web';
}

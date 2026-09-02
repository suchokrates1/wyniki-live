import { APP_VERSION } from './heartbeat.js';
import { deviceLabel } from './diagnostics.js';

function clip(value, max) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : '';
}

export function umpireClientHeaders({
  appVersion = APP_VERSION,
  locale = '',
  navigatorRef = globalThis.navigator,
} = {}) {
  const headers = {
    'X-TennisReferee-Platform': 'pwa',
    'X-TennisReferee-App-Version': clip(appVersion, 50),
    'X-TennisReferee-Device': clip(deviceLabel(navigatorRef), 160),
  };
  const localeText = clip(locale || navigatorRef?.language, 40);
  if (localeText) headers['X-TennisReferee-Locale'] = localeText;
  const country = localeText.split('-')[1];
  if (country && /^[A-Za-z]{2}$/.test(country)) {
    headers['X-TennisReferee-Country'] = country.toUpperCase();
  }
  const timezone = clip(Intl.DateTimeFormat().resolvedOptions().timeZone, 80);
  if (timezone) headers['X-TennisReferee-Timezone'] = timezone;
  return headers;
}

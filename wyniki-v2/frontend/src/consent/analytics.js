export const ANALYTICS_CONSENT_KEY = 'wyniki.analyticsConsent';
export const UMAMI_SRC = 'https://stats.dawidsuchodolski.pl/script.js';
export const UMAMI_WEBSITE_ID = 'b49919d3-6628-40cc-9213-72ec52409e28';

export function readAnalyticsConsent(storage = globalThis.localStorage) {
  const value = storage?.getItem?.(ANALYTICS_CONSENT_KEY);
  return value === 'accepted' || value === 'rejected' ? value : null;
}

export function writeAnalyticsConsent(value, storage = globalThis.localStorage) {
  if (value !== 'accepted' && value !== 'rejected') return;
  storage?.setItem?.(ANALYTICS_CONSENT_KEY, value);
}

export function hasUmamiScript(documentRef = globalThis.document) {
  return Boolean(documentRef?.querySelector?.(`script[data-website-id="${UMAMI_WEBSITE_ID}"]`));
}

export function loadUmami({ documentRef = globalThis.document } = {}) {
  if (!documentRef?.createElement || hasUmamiScript(documentRef)) return false;
  const script = documentRef.createElement('script');
  script.defer = true;
  script.src = UMAMI_SRC;
  script.setAttribute('data-website-id', UMAMI_WEBSITE_ID);
  (documentRef.head || documentRef.documentElement).appendChild(script);
  return true;
}

export function applyAnalyticsConsent(value, { storage = globalThis.localStorage, documentRef = globalThis.document } = {}) {
  writeAnalyticsConsent(value, storage);
  if (value === 'accepted') loadUmami({ documentRef });
  return value;
}

export function loadUmamiIfAllowed({ storage = globalThis.localStorage, documentRef = globalThis.document } = {}) {
  if (readAnalyticsConsent(storage) !== 'accepted') return false;
  return loadUmami({ documentRef });
}

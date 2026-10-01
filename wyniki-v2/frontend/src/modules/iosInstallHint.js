/* Where this site can be installed, and how to say so.
 *
 * iOS Safari has no install event, only the Share sheet. Chromium (Chrome,
 * Edge, Samsung Internet) fires `beforeinstallprompt` and can install from our
 * own button. macOS Safari installs through the File menu. iOS Chrome and
 * Firefox cannot install a PWA at all, so a hint there would be a lie.
 */

const STORAGE_KEY = 'wyniki.iosInstallHintDismissed';

/** iOS Safari, including iPadOS, which reports itself as a Mac with touch. */
export function isIosSafari(userAgent, maxTouchPoints = 0, platform = '') {
  const ua = String(userAgent || '');
  const iPadOs = /Macintosh/.test(ua) && Number(maxTouchPoints) > 1;
  if (!/iPhone|iPad|iPod/.test(ua) && !iPadOs && !/^iP/.test(String(platform))) return false;
  // Every iOS browser runs on WebKit, but only Safari's own UI has the Share sheet
  // route; Chrome and Firefox on iOS cannot install at all, so a hint would lie.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function isStandalone(navigatorLike, matchMedia) {
  if (navigatorLike?.standalone) return true;
  try {
    return !!matchMedia?.('(display-mode: standalone)')?.matches;
  } catch {
    return false;
  }
}

export function wasDismissed(storage) {
  try {
    return storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberDismissed(storage) {
  try {
    storage?.setItem(STORAGE_KEY, '1');
  } catch {
    /* the hint simply comes back next time */
  }
}

/** Show the hint only on iOS Safari, not already installed, not waved away. */
export function shouldShowIosInstallHint({ userAgent, maxTouchPoints, platform, navigatorLike, matchMedia, storage }) {
  return installOffer({ userAgent, maxTouchPoints, platform, navigatorLike, matchMedia, storage }) === 'ios';
}

/**
 * How to offer installation, or null when this browser cannot install.
 * `native` means Chromium has already handed us `beforeinstallprompt`.
 * `chromium` means it can install, but the event has not arrived yet.
 */
export function installOffer({
  userAgent,
  maxTouchPoints,
  platform,
  navigatorLike,
  matchMedia,
  storage,
  hasNativePrompt = false,
}) {
  if (isStandalone(navigatorLike, matchMedia) || wasDismissed(storage)) return null;
  if (isIosSafari(userAgent, maxTouchPoints, platform)) return 'ios';
  const ua = String(userAgent || '');
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return null;
  if (/Firefox\//.test(ua)) return null;
  if (/Chrome|Chromium|Edg\/|SamsungBrowser|OPR\//.test(ua)) {
    return hasNativePrompt ? 'native' : 'chromium';
  }
  if (/Macintosh/.test(ua) && /Safari/.test(ua)) return 'mac';
  return null;
}

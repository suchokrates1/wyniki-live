/* The "Add to Home Screen" nudge for iOS.
 *
 * Safari fires no `beforeinstallprompt`, so on iPhone and iPad there is no
 * install button to offer — only the Share sheet, which people have to be told
 * about. Everywhere else the browser handles this itself and we stay quiet.
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
  if (!isIosSafari(userAgent, maxTouchPoints, platform)) return false;
  if (isStandalone(navigatorLike, matchMedia)) return false;
  return !wasDismissed(storage);
}

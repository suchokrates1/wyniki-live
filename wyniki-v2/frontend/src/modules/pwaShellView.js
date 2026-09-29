/* The two small pieces of PWA chrome on the public page: the "new version"
 * toast and the iOS "add to home screen" hint. Both are quiet by default and
 * both stay out of the way of the scores.
 */

import { readAnalyticsConsent } from '../consent/analytics.js';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/locale.js';
import { lookupTranslation } from '../i18n/runtime.js';
import { TRANSLATIONS } from '../i18n/translations.js';
import { rememberDismissed, shouldShowIosInstallHint } from './iosInstallHint.js';
import { applyUpdate, reloadOnControllerChange, watchForUpdate } from './swUpdate.js';

function resolveLang() {
  const htmlLang = String(document.documentElement.lang || '').slice(0, 2);
  if (isSupportedLanguage(htmlLang)) return htmlLang;
  try {
    const saved = localStorage.getItem('lang');
    if (isSupportedLanguage(saved)) return saved;
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_LANGUAGE;
}

function text(lang) {
  return {
    ...(TRANSLATIONS[DEFAULT_LANGUAGE]?.pwa || {}),
    ...(lookupTranslation(TRANSLATIONS, lang)?.pwa || {}),
  };
}

export function registerPwaShell(Alpine, { registration = null } = {}) {
  Alpine.data('pwaShell', () => ({
    updateReady: false,
    installHint: false,
    lang: DEFAULT_LANGUAGE,

    init() {
      this.lang = resolveLang();
      this._onLang = () => { this.lang = resolveLang(); };
      this._observer = new MutationObserver(this._onLang);
      this._observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

      // One ask at a time. While the consent banner is still unanswered it owns
      // the bottom of the screen, and stacking a second bar there both overlaps
      // it and pesters the reader twice on a first visit.
      this.installHint = !!readAnalyticsConsent() && shouldShowIosInstallHint({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform,
        navigatorLike: navigator,
        matchMedia: window.matchMedia?.bind(window),
        storage: window.localStorage,
      });

      const ready = registration || window.__wynikiSwRegistration;
      if (ready) this.watch(ready);
      else window.addEventListener('wyniki:sw-registered', (event) => this.watch(event.detail), { once: true });

      reloadOnControllerChange(navigator.serviceWorker, () => window.location.reload());
    },

    destroy() {
      this._observer?.disconnect();
    },

    watch(reg) {
      this._registration = reg;
      watchForUpdate(reg, () => {
        this.updateReady = true;
        // The toast is actionable and transient; the install hint can wait.
        this.installHint = false;
      }, navigator.serviceWorker);
    },

    pwaText() {
      return text(this.lang);
    },

    refresh() {
      this.updateReady = false;
      applyUpdate(this._registration);
      // If the worker never answers (it was already gone), reload anyway.
      setTimeout(() => window.location.reload(), 1500);
    },

    dismissInstallHint() {
      this.installHint = false;
      rememberDismissed(window.localStorage);
    },
  }));
}

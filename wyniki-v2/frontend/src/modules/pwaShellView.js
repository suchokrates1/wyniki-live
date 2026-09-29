/* The two small pieces of PWA chrome on the public page: the "new version"
 * toast and the iOS "add to home screen" hint. Both are quiet by default and
 * both stay out of the way of the scores.
 */

import { readAnalyticsConsent } from '../consent/analytics.js';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/locale.js';
import { lookupTranslation } from '../i18n/runtime.js';
import { TRANSLATIONS } from '../i18n/translations.js';
import { rememberDismissed, shouldShowIosInstallHint } from './iosInstallHint.js';
import { fetchPushKey, isPushSupported, subscribe, unsubscribe } from './pushClient.js';
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

/** The bell in the header. Hidden entirely unless the browser can do push and
 * the server has VAPID keys, so nothing is offered that cannot work. */
export function registerPwaPush(Alpine) {
  Alpine.data('pwaPush', () => ({
    available: false,
    enabled: false,
    busy: false,
    denied: false,
    lang: DEFAULT_LANGUAGE,

    async init() {
      this.lang = resolveLang();
      this._observer = new MutationObserver(() => { this.lang = resolveLang(); });
      this._observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

      if (!isPushSupported(window)) return;
      const key = await fetchPushKey();
      if (!key.enabled || !key.public_key) return;

      this._publicKey = key.public_key;
      try {
        this._registration = await navigator.serviceWorker.ready;
      } catch {
        return;
      }
      this.denied = window.Notification?.permission === 'denied';
      this.enabled = !!(await this._registration.pushManager.getSubscription());
      this.available = true;
    },

    destroy() {
      this._observer?.disconnect();
    },

    pwaText() {
      return text(this.lang);
    },

    label() {
      const t = this.pwaText();
      if (this.denied) return t.pushBlocked;
      return this.enabled ? t.pushDisable : t.pushEnable;
    },

    async toggle() {
      if (this.busy || this.denied) return;
      this.busy = true;
      try {
        if (this.enabled) {
          await unsubscribe({ registration: this._registration });
          this.enabled = false;
          return;
        }
        const result = await subscribe({
          registration: this._registration,
          publicKey: this._publicKey,
          lang: this.lang,
        });
        this.enabled = result.ok;
        if (!result.ok && result.reason === 'denied') this.denied = true;
      } catch {
        this.enabled = false;
      } finally {
        this.busy = false;
      }
    },
  }));
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

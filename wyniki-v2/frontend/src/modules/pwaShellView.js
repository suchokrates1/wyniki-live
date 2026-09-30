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
import { applyUpdate, createUpdateSession, reloadOnControllerChange, watchForUpdate } from './swUpdate.js';

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
    open: false,
    lang: DEFAULT_LANGUAGE,
    players: [],          // names this device follows
    roster: [],           // everyone in the active tournament, for the picker
    search: '',
    prefs: {
      notify_match_start: true, notify_plan: true, notify_change: true,
      notify_reminder: false, notify_delay: false, reminder_minutes: 30,
    },

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

    togglePanel() {
      // The panel opens even when the browser has blocked notifications: a bell
      // that does nothing on click tells the reader nothing about why.
      this.open = !this.open;
      if (this.open && !this.denied && !this.roster.length) this.loadRoster();
    },

    async loadRoster() {
      try {
        const response = await fetch('/api/players/active');
        if (!response.ok) return;
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.players || []);
        this.roster = list
          .map((p) => String(p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')).trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
      } catch {
        this.roster = [];
      }
    },

    matchingPlayers() {
      const needle = this.search.trim().toLowerCase();
      if (!needle) return [];
      return this.roster
        .filter((name) => name.toLowerCase().includes(needle) && !this.players.includes(name))
        .slice(0, 8);
    },

    addPlayer(name) {
      if (this.players.length >= 10 || this.players.includes(name)) return;
      this.players.push(name);
      this.search = '';
    },

    removePlayer(name) {
      this.players = this.players.filter((p) => p !== name);
    },

    /** Anything ticked is worth a subscription; nothing ticked means unsubscribe. */
    wantsAnything() {
      // reminder_minutes is a setting, not a wish - only the flags count.
      return Object.entries(this.prefs)
        .filter(([key]) => key.startsWith('notify_'))
        .some(([, value]) => value);
    },

    async save() {
      if (this.busy || this.denied) return;
      this.busy = true;
      try {
        if (!this.wantsAnything()) {
          await unsubscribe({ registration: this._registration });
          this.enabled = false;
          this.open = false;
          return;
        }
        const result = await subscribe({
          registration: this._registration,
          publicKey: this._publicKey,
          lang: this.lang,
          players: this.players,
          preferences: this.prefs,
        });
        this.enabled = result.ok;
        if (result.ok) this.open = false;
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

      this._session = createUpdateSession();
      reloadOnControllerChange(navigator.serviceWorker, () => window.location.reload(), this._session);
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
      applyUpdate(this._registration, this._session);
      // If the worker never answers (it was already gone), reload anyway.
      setTimeout(() => window.location.reload(), 1500);
    },

    dismissInstallHint() {
      this.installHint = false;
      rememberDismissed(window.localStorage);
    },
  }));
}

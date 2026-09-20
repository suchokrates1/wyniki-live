import { applyTranslationPatches, lookupTranslation } from '../i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from '../i18n/translations.js';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/locale.js';
import { privacyHref } from '../shared/privacyHref.js';
import {
  applyAnalyticsConsent,
  loadUmamiIfAllowed,
  readAnalyticsConsent,
} from './analytics.js';

applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);

function resolveConsentLang() {
  const htmlLang = String(document.documentElement.lang || '').slice(0, 2);
  if (isSupportedLanguage(htmlLang)) return htmlLang;
  const saved = localStorage.getItem('lang');
  return isSupportedLanguage(saved) ? saved : DEFAULT_LANGUAGE;
}

export function registerAnalyticsConsent(Alpine) {
  Alpine.data('analyticsConsent', () => ({
    visible: false,
    lang: DEFAULT_LANGUAGE,

    init() {
      loadUmamiIfAllowed();
      this.lang = resolveConsentLang();
      this.visible = !readAnalyticsConsent();
      this.syncBannerClass();
      this._onLang = () => {
        this.lang = resolveConsentLang();
        this.syncBannerSpace();
      };
      this._onResize = () => this.syncBannerSpace();
      this._observer = new MutationObserver(this._onLang);
      this._observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      window.addEventListener('storage', this._onLang);
      window.addEventListener('resize', this._onResize);
      this.$watch('visible', () => this.syncBannerSpace());
      this.$watch('lang', () => this.syncBannerSpace());
      this.observeLayout();
    },

    destroy() {
      this._observer?.disconnect();
      this._ro?.disconnect();
      window.removeEventListener('storage', this._onLang);
      window.removeEventListener('resize', this._onResize);
      document.body.classList.remove('has-consent-banner');
      document.body.style.removeProperty('--consent-banner-space');
    },

    observeLayout() {
      if (this._ro || typeof ResizeObserver === 'undefined') return;
      this._ro = new ResizeObserver(() => this.applyBannerSpace());
      this.$nextTick(() => {
        if (this.$el) this._ro.observe(this.$el);
        const footer = document.querySelector('footer');
        if (footer) this._ro.observe(footer);
      });
    },

    syncBannerClass() {
      document.body.classList.toggle('has-consent-banner', this.visible);
      this.syncBannerSpace();
    },

    applyBannerSpace() {
      if (!this.visible) {
        document.body.style.removeProperty('--consent-banner-space');
        if (this.$el) this.$el.style.bottom = '';
        return;
      }
      const footer = document.querySelector('footer');
      const footerH = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;
      if (this.$el) this.$el.style.bottom = `${footerH}px`;
      const bannerH = this.$el ? Math.ceil(this.$el.getBoundingClientRect().height) : 0;
      document.body.style.setProperty('--consent-banner-space', `${bannerH + footerH}px`);
    },

    syncBannerSpace() {
      this.observeLayout();
      this.$nextTick(() => this.applyBannerSpace());
      requestAnimationFrame(() => this.applyBannerSpace());
    },

    consentText() {
      const catalog = lookupTranslation(TRANSLATIONS, this.lang, DEFAULT_LANGUAGE);
      return {
        ...(TRANSLATIONS.pl.consent || {}),
        ...(catalog.consent || {}),
      };
    },

    privacyHref() {
      return privacyHref(this.lang, 'analityka');
    },

    accept() {
      applyAnalyticsConsent('accepted');
      this.visible = false;
      this.syncBannerClass();
    },

    reject() {
      applyAnalyticsConsent('rejected');
      this.visible = false;
      this.syncBannerClass();
    },
  }));
}

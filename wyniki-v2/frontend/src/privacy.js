import Alpine from 'alpinejs';
import { ignoreCancelledAlpineTransitions } from './shared/alpineTransitions.js';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGE_LABELS, resolveLocale, SUPPORTED_LANGUAGES } from './i18n/locale.js';
import { applyTranslationPatches, lookupTranslation } from './i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from './i18n/translations.js';
import { getPrivacyContent } from './i18n/legal/privacyContent.js';
import { formatTemplate as fmt } from './shared/text.js';
import { privacyHref } from './shared/privacyHref.js';
import { registerAnalyticsConsent } from './consent/banner.js';
import './main.css';

applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);

function getTranslation(lang) {
  return lookupTranslation(TRANSLATIONS, lang, DEFAULT_LANGUAGE);
}

window.Alpine = Alpine;
registerAnalyticsConsent(Alpine);

Alpine.data('privacyApp', () => ({
  lang: DEFAULT_LANGUAGE,
  supportedLanguages: SUPPORTED_LANGUAGES,
  languageLabels: LANGUAGE_LABELS,
  darkMode: false,

  init() {
    const urlLang = new URLSearchParams(location.search).get('lang');
    if (urlLang && isSupportedLanguage(urlLang)) {
      this.lang = urlLang;
    } else {
      const savedLang = localStorage.getItem('lang');
      if (savedLang && isSupportedLanguage(savedLang)) this.lang = savedLang;
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.darkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this.onLangChange();
    this._scrollToHash();
  },

  tr() {
    return getTranslation(this.lang);
  },

  uiText() {
    return { ...(TRANSLATIONS.pl.ui || {}), ...(this.tr().ui || {}) };
  },

  legal() {
    return getPrivacyContent(this.lang);
  },

  updatedText() {
    return fmt(this.legal().updatedLabel || '', { date: this.legal().updatedDate });
  },

  locale() {
    return resolveLocale(this.lang);
  },

  privacyHref(hash = '') {
    return privacyHref(this.lang, hash);
  },

  onLangChange() {
    const legal = this.legal();
    document.documentElement.lang = legal.htmlLang || this.lang;
    document.title = `${this.uiText().privacyPageTitle || legal.title} — blindtennis.app`;
    const description = this.uiText().privacyPageDescription;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    }
    localStorage.setItem('lang', this.lang);
    const url = new URL(location.href);
    url.searchParams.set('lang', this.lang);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  },

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    const theme = this.darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  },

  _scrollToHash() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
  },
}));

ignoreCancelledAlpineTransitions();
Alpine.start();

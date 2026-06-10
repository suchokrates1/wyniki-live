import { DEFAULT_LANGUAGE, isSupportedLanguage, resolveLocale, SUPPORTED_LANGUAGES } from './locale.js';
import { applyTranslationPatches, lookupTranslation } from './runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from './translations.js';
import { OFFICE_TRANSLATION_PATCHES } from './officeTranslations.js';
import { formatTemplate as fmt } from '../shared/text.js';

applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);
applyTranslationPatches(TRANSLATIONS, OFFICE_TRANSLATION_PATCHES);

function getTranslation(lang) {
  return lookupTranslation(TRANSLATIONS, lang, DEFAULT_LANGUAGE);
}

export function createOfficeI18n() {
  return {
    lang: DEFAULT_LANGUAGE,
    supportedLanguages: SUPPORTED_LANGUAGES,

    initOfficeLang() {
      const urlParams = new URLSearchParams(location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang && isSupportedLanguage(urlLang)) {
        this.lang = urlLang;
      } else {
        const savedLang = localStorage.getItem('lang');
        if (savedLang && isSupportedLanguage(savedLang)) this.lang = savedLang;
      }
      this.applyOfficeDocumentLang();
    },

    officeTr() {
      return getTranslation(this.lang);
    },

    ot(key, values = {}) {
      const val = key.split('.').reduce((obj, part) => obj?.[part], this.officeTr().office);
      if (typeof val === 'string') return fmt(val, values);
      return '';
    },

    officeUi() {
      return { ...(TRANSLATIONS.pl.ui || {}), ...(this.officeTr().ui || {}) };
    },

    officeLocale() {
      return resolveLocale(this.lang);
    },

    applyOfficeDocumentLang() {
      document.documentElement.lang = this.officeTr().htmlLang || this.lang;
      document.title = this.ot('pageTitle') || 'Tournament Office';
    },

    onLangChange() {
      this.applyOfficeDocumentLang();
      localStorage.setItem('lang', this.lang);
      const url = new URL(location.href);
      url.searchParams.set('lang', this.lang);
      history.replaceState(null, '', url.toString());
    },
  };
}

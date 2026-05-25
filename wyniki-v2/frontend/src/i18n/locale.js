export const DEFAULT_LANGUAGE = 'pl';

export const SUPPORTED_LANGUAGES = ['pl', 'de', 'en', 'it', 'es', 'fr'];

export const LOCALE_BY_LANGUAGE = {
  pl: 'pl-PL',
  de: 'de-DE',
  en: 'en-US',
  it: 'it-IT',
  es: 'es-ES',
  fr: 'fr-FR',
};

export function isSupportedLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang);
}

export function resolveLocale(lang) {
  return LOCALE_BY_LANGUAGE[lang] || LOCALE_BY_LANGUAGE[DEFAULT_LANGUAGE];
}
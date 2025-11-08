// Translations Management
const TRANSLATIONS = {
  pl: {
    courtLabel: 'Kort {court}',
    live: 'NA ŻYWO',
    set: 'Set',
    points: 'Punkty',
    games: 'Gemy',
    duration: 'Czas trwania',
    history: 'Historia meczów',
    noMatches: 'Brak aktywnych meczów',
    loading: 'Ładowanie...',
    error: 'Błąd połączenia',
    lastUpdate: 'Ostatnia aktualizacja',
  },
  en: {
    courtLabel: 'Court {court}',
    live: 'LIVE',
    set: 'Set',
    points: 'Points',
    games: 'Games',
    duration: 'Duration',
    history: 'Match History',
    noMatches: 'No active matches',
    loading: 'Loading...',
    error: 'Connection error',
    lastUpdate: 'Last update',
  },
  de: {
    courtLabel: 'Platz {court}',
    live: 'LIVE',
    set: 'Satz',
    points: 'Punkte',
    games: 'Spiele',
    duration: 'Dauer',
    history: 'Spielgeschichte',
    noMatches: 'Keine aktiven Spiele',
    loading: 'Laden...',
    error: 'Verbindungsfehler',
    lastUpdate: 'Letzte Aktualisierung',
  }
};

const LANG_KEY = 'preferred-language';
const DEFAULT_LANG = 'pl';
const SUPPORTED_LANGS = ['pl', 'en', 'de', 'it', 'es', 'fi', 'uk', 'fr', 'lt'];

export function useTranslations() {
  function getCurrentLang() {
    const saved = localStorage.getItem(LANG_KEY);
    return SUPPORTED_LANGS.includes(saved) ? saved : DEFAULT_LANG;
  }

  function setLang(lang) {
    if (SUPPORTED_LANGS.includes(lang)) {
      localStorage.setItem(LANG_KEY, lang);
      return true;
    }
    return false;
  }

  function t(key, params = {}) {
    const lang = getCurrentLang();
    let text = TRANSLATIONS[lang]?.[key] || TRANSLATIONS[DEFAULT_LANG]?.[key] || key;
    
    // Replace parameters like {court}
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });
    
    return text;
  }

  return { getCurrentLang, setLang, t, SUPPORTED_LANGS };
}

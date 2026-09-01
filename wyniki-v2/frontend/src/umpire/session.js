const LANG_KEY = 'umpire.selected_language';
const TOURNAMENT_KEY = 'umpire.selected_tournament';
const COURT_SESSION_KEY = 'umpire.court_session';
const DRAFT_KEY = 'umpire.match_draft';

export const AVAILABLE_LANGUAGES = Object.freeze([
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'lt', name: 'Lietuvių', flag: '🇱🇹' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
]);

export function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createUmpireSession({
  localStore = globalThis.localStorage,
  sessionStore = globalThis.sessionStorage,
  now = () => new Date(),
} = {}) {
  return {
    hasLanguageSelected() {
      return localStore.getItem(LANG_KEY) != null;
    },

    getLanguage() {
      return localStore.getItem(LANG_KEY) || 'en';
    },

    setLanguage(code) {
      localStore.setItem(LANG_KEY, code);
    },

    saveTournament(tournament) {
      localStore.setItem(TOURNAMENT_KEY, JSON.stringify({
        id: tournament.id,
        name: tournament.name,
        day: todayKey(now()),
      }));
    },

    getTournamentForToday() {
      const raw = localStore.getItem(TOURNAMENT_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.day !== todayKey(now())) {
          localStore.removeItem(TOURNAMENT_KEY);
          return null;
        }
        return parsed;
      } catch {
        localStore.removeItem(TOURNAMENT_KEY);
        return null;
      }
    },

    saveCourtSession(session) {
      sessionStore.setItem(COURT_SESSION_KEY, JSON.stringify(session));
    },

    getCourtSession() {
      const raw = sessionStore.getItem(COURT_SESSION_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        sessionStore.removeItem(COURT_SESSION_KEY);
        return null;
      }
    },

    hasValidCourtToken(nowMs = Date.now()) {
      const session = this.getCourtSession();
      if (!session?.token || !session.courtId) return false;
      if (session.expiresAtMillis == null) return true;
      return session.expiresAtMillis > nowMs;
    },

    clearCourtSession() {
      sessionStore.removeItem(COURT_SESSION_KEY);
    },

    saveDraft(draft) {
      sessionStore.setItem(DRAFT_KEY, JSON.stringify(draft));
    },

    getDraft() {
      const raw = sessionStore.getItem(DRAFT_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        sessionStore.removeItem(DRAFT_KEY);
        return null;
      }
    },
  };
}

export function parseExpiresAt(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() === String(numeric)) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function firstScreen({ hasLanguage, forceLanguage = false }) {
  if (forceLanguage || !hasLanguage) return 'language';
  return 'tournament';
}

import Alpine from 'alpinejs';
import {
  describeSpeechSet as describeSpeechSetForScreenReader,
  describeSpeechSetSequence as describeSpeechSetSequenceForScreenReader,
  spokenScore as spokenScoreForScreenReader,
} from './a11y/scoreNarration.js';
import { DEFAULT_LANGUAGE, isSupportedLanguage, resolveLocale, SUPPORTED_LANGUAGES } from './i18n/locale.js';
import { applyTranslationPatches, lookupTranslation } from './i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from './i18n/translations.js';
import { warnMissingTranslationKeys } from './i18n/validation.js';
import { createBracketView } from './modules/bracketView.js';
import { createHistoryView } from './modules/historyView.js';
import { createLiveCourtView } from './modules/liveCourtView.js';
import { createLiveRuntimeView } from './modules/liveRuntimeView.js';
import { createPlayersView } from './modules/playersView.js';
import { createScheduleView } from './modules/scheduleView.js';
import { createTournamentView } from './modules/tournamentsView.js';
import { applyHashRoute, updateHashFromState } from './modules/routing.js';
import { formatTemplate as fmt } from './shared/text.js';
import './main.css';

function codeToFlag(code) {
  if (!code || code.length < 2) return '';
  return 'https://flagcdn.com/w40/' + code.toLowerCase().slice(0, 2) + '.png';
}

applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);

if (import.meta.env.DEV) {
  warnMissingTranslationKeys(TRANSLATIONS, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE);
}

function getTranslation(lang) {
  return lookupTranslation(TRANSLATIONS, lang, DEFAULT_LANGUAGE);
}

/* ============================================================
   ALPINE.JS APP
   ============================================================ */
window.Alpine = Alpine;

Alpine.data('tennisApp', () => ({
  lang: 'pl',
  darkMode: false,
  ...createHistoryView(),
  ...createPlayersView(),
  ...createBracketView(),
  ...createLiveRuntimeView(),
  ...createLiveCourtView(),
  ...createScheduleView(),
  ...createTournamentView(),
  activeTab: 'live',
  // Live sub-tab state
  liveSubTab: 'scores',

  _navigating: false,

  init() {
    // Restore language from URL param or localStorage
    const urlParams = new URLSearchParams(location.search);
    const urlLang = urlParams.get('lang');
    const urlTournamentId = urlParams.get('tournament_id') || urlParams.get('tid');
    this.privateTournamentAccessKey = urlParams.get('access_key') || urlParams.get('key') || '';
    this.simulationStage = urlParams.get('etap') || urlParams.get('stage') || '';
    if (urlLang && isSupportedLanguage(urlLang)) {
      this.lang = urlLang;
    } else {
      const savedLang = localStorage.getItem('lang');
      if (savedLang && isSupportedLanguage(savedLang)) this.lang = savedLang;
    }
    this.onLangChange();
    // Restore dark mode preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.darkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this._applyHash();
    if (urlTournamentId && !location.hash) {
      this.activeTab = 'tournaments';
      this.selectedTournamentId = String(urlTournamentId);
      this.selectedPlayerId = null;
      this.historySubTab = 'bracket';
      this.onTournamentSelected();
      this._updateHash(true);
    }
    window.addEventListener('hashchange', () => this._applyHash());
    window.addEventListener('popstate', () => this._applyHash());
    this.connectSSE();
    this.fetchInitialData();
    this.fetchHistory();
    this.fetchTournaments();
    this.fetchAllPlayers();
  },

  /* --- Hash routing --- */
  _applyHash() {
    applyHashRoute(this);
  },

  async openMainTab(tab) {
    if (tab === 'live') {
      this.activeTab = 'live';
      this.liveSubTab = 'scores';
      this.selectedPlayerId = null;
      this.selectedTournamentId = '';
      await this.fetchInitialData();
    } else if (tab === 'tournaments') {
      this.activeTab = 'tournaments';
      this.selectedTournamentId = '';
      this.selectedPlayerId = null;
      await this.fetchTournaments();
    } else if (tab === 'players') {
      this.activeTab = 'players';
      this.selectedPlayerId = null;
      this.playerProfile = null;
      this._profileIsGlobal = false;
      this.playerSearch = '';
      this.playerGender = '';
      this.playerCountry = '';
      this.playerCategory = '';
      await this.fetchAllPlayers();
    }
    this._updateHash();
  },

  async openLiveSubTab(subTab) {
    this.liveSubTab = subTab;
    if (subTab === 'bracket') await this.fetchBracket();
    else if (subTab === 'schedule') await this.fetchSchedule();
    else if (subTab === 'history') await this.fetchHistory();
    else await this.fetchInitialData();
    this._updateHash();
  },

  async selectLiveBracketCategory(categoryName) {
    this.bracketCategory = categoryName;
    await this.fetchBracket();
    this._updateHash(true);
  },

  _updateHash(replace = false) {
    updateHashFromState(this, replace);
  },

  /* --- Flag helper --- */
  codeToFlag(code) { return codeToFlag(code); },

  /* --- Translation helpers --- */
  tr() { return getTranslation(this.lang); },
  uiText() {
    return { ...(TRANSLATIONS.pl.ui || {}), ...(this.tr().ui || {}) };
  },
  acc() {
    return { ...(TRANSLATIONS.pl.accessibility || {}), ...(this.tr().accessibility || {}) };
  },
  locale() {
    return resolveLocale(this.lang);
  },

  t(key, values = {}) {
    const tr = this.tr();
    const val = key.split('.').reduce((o, k) => o?.[k], tr);
    if (typeof val === 'string') return fmt(val, values);
    // Fallback for special keys
    if (key === 'setLabel') return fmt(this.acc().set || 'Set {number}', values);
    if (key === 'courtLabel') return fmt(tr.courtLabel || 'Kort {court}', values);
    if (key === 'navLabel') return tr.navLabel || 'Nawigacja';
    return '';
  },

  formatText(str, values = {}) {
    return fmt(str || '', values);
  },

  onLangChange() {
    document.documentElement.lang = this.tr().htmlLang || this.lang;
    document.title = this.tr().pageTitle || 'Wyniki tenisowe – na żywo';
    const description = this.uiText().pageDescription;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    }
    localStorage.setItem('lang', this.lang);
    // Update ?lang= URL parameter
    const url = new URL(location.href);
    url.searchParams.set('lang', this.lang);
    history.replaceState(null, '', url.toString());
  },

  /* --- Dark mode --- */
  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    const theme = this.darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  },

  /* --- Live runtime methods are composed from modules/liveRuntimeView.js --- */

  /* --- Tournament view methods are composed from modules/tournamentsView.js --- */

  /* --- Bracket view methods are composed from modules/bracketView.js --- */

  spokenScore(left, right) {
    return spokenScoreForScreenReader(this.acc(), left, right);
  },

  describeSpeechSet(set, index = 0) {
    return describeSpeechSetForScreenReader(this.acc(), set, index);
  },

  describeSpeechSetSequence(sets = []) {
    return describeSpeechSetSequenceForScreenReader(this.acc(), sets);
  },

  describeBracketSetsForSpeech(sets = []) {
    return this.describeSpeechSetSequence((sets || []).map((set) => ({
      left: set?.g1 ?? 0,
      right: set?.g2 ?? 0,
      tb: set?.tb ?? null,
      stb: !!set?.stb,
    })));
  },

  describeHistorySetsForSpeech(match) {
    return this.describeSpeechSetSequence(this.getMatchSets(match).map((set) => ({
      left: set?.a ?? 0,
      right: set?.b ?? 0,
      tb: set?.tb ?? null,
      stb: !!set?.isSuperTB,
    })));
  },

  buildCompletedMatchAria({ intro = [], playerA, playerB, winnerName = '', scoreText = '', details = [] }) {
    const unknownPlayer = this.acc().unknownPlayer || 'zawodnik nieustalony';
    const parts = [...intro.filter(Boolean)];
    parts.push(`${playerA || unknownPlayer} ${this.acc().versus || 'kontra'} ${playerB || unknownPlayer}`);
    if (winnerName) {
      parts.push(`${this.acc().winner || 'Zwyciezca'}: ${winnerName}`);
    }
    if (scoreText) {
      parts.push(`${this.acc().result || 'Wynik meczu'}: ${scoreText}`);
    }
    parts.push(...details.filter(Boolean));
    return parts.join('. ');
  },

  /* --- Schedule view methods are composed from modules/scheduleView.js --- */

  /* --- Players view methods are composed from modules/playersView.js --- */

  /* --- SSE and DOM animations are composed from modules/liveRuntimeView.js --- */

  /* --- Live court methods are composed from modules/liveCourtView.js --- */

  /* --- History view methods are composed from modules/historyView.js --- */
}));

Alpine.start();

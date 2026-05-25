import Alpine from 'alpinejs';
import {
  describeSpeechSet as describeSpeechSetForScreenReader,
  describeSpeechSetSequence as describeSpeechSetSequenceForScreenReader,
  spokenScore as spokenScoreForScreenReader,
} from './a11y/scoreNarration.js';
import { publicApi } from './api/publicApi.js';
import { DEFAULT_LANGUAGE, isSupportedLanguage, resolveLocale, SUPPORTED_LANGUAGES } from './i18n/locale.js';
import { applyTranslationPatches, lookupTranslation } from './i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from './i18n/translations.js';
import { warnMissingTranslationKeys } from './i18n/validation.js';
import {
  computeTieVisibility,
  getRegularSetWins as getRegularSetWinsForCourt,
  getSetIndices as getSetIndicesForCourt,
  getSetScore as getSetScoreForCourt,
  getStoredSetScore as getStoredSetScoreForCourt,
  getSuperTiebreakScore as getSuperTiebreakScoreForCourt,
  getTiebreakInfo as getTiebreakInfoForCourt,
  hasSuperTiebreak as hasSuperTiebreakForCourt,
  isDecidingSuperTiebreak as isDecidingSuperTiebreakForCourt,
  isSuperTiebreak as isSuperTiebreakForCourt,
  isTiebreak as isTiebreakForCourt,
  resolveDisplayPoints as resolveDisplayPointsForCourt,
} from './modules/liveScores.js';
import { createHistoryView } from './modules/historyView.js';
import {
  buildTournamentAccessQuery,
  getClearedTournamentDetailState,
  getSelectedTournamentName,
  getTournamentOpenState,
} from './modules/tournaments.js';
import {
  buildBracketCategories,
  compareBracketCategoryNames as compareBracketCategoryNamesData,
  getBracketCategoryLabel,
  getGroupStandingsRows,
  getKnockoutPhaseClass,
  getKnockoutPodiumEntries,
  isFinalPhase as isFinalBracketPhase,
  resolveActiveBracketCategory,
} from './modules/bracket.js';
import { applyHashRoute, updateHashFromState } from './modules/routing.js';
import {
  filterPlayersList,
  getPlayerCategoryOptions,
  getPlayerCountryOptions,
  getPlayerProfileLookupCandidates,
  getProfileMedalEmoji,
  getProfileWinRate,
  normalizePlayerProfileMode,
} from './modules/players.js';
import {
  buildScheduleGroups,
  compareScheduleMatches as compareScheduleMatchesData,
  flattenScheduleDay,
  formatScheduleArchivedDaysLabel,
  formatScheduleDate as formatScheduleDateValue,
  formatScheduleTime as formatScheduleTimeValue,
  getScheduleCategoryLabel,
  getScheduleCurrentDate,
  getScheduleCourtTabLabel,
  getScheduleDayBucket,
  getScheduleDays,
  getScheduleDomId,
  getScheduleGroupMeta,
  getScheduleMatchCount,
  getSchedulePastDays,
  getSchedulePreparedDays,
  getSchedulePrimaryDays,
  getScheduleSelectionKey,
  getScheduleStatusLabel,
  normalizeScheduleText,
  scheduleMatchMatchesQuery as doesScheduleMatchMatchQuery,
} from './modules/schedule.js';
import {
  getCourtDisplayLabel as getLocalizedCourtDisplayLabel,
  getSortedCourtIds,
  localizeCourtLabel as localizeCourtLabelValue,
} from './shared/courtLabels.js';
import { formatDuration } from './shared/date.js';
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
   SCORE ANIMATION HELPERS (ported from v1)
   ============================================================ */
function flash(el) {
  if (!el) return;
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 1200);
}

function animatePointsChange(cell, prevText, nextText) {
  try {
    const old = String(prevText ?? '');
    const neu = String(nextText ?? '');
    const max = Math.max(old.length, neu.length);
    const container = document.createElement('span');
    container.className = 'digits';
    for (let i = 0; i < max; i++) {
      const digit = document.createElement('span');
      digit.className = 'digit';
      const spanOld = document.createElement('span');
      spanOld.className = 'd-old';
      spanOld.textContent = old[i] ?? '';
      const spanNew = document.createElement('span');
      spanNew.className = 'd-new';
      spanNew.textContent = neu[i] ?? '';
      digit.append(spanOld, spanNew);
      container.appendChild(digit);
    }
    cell.innerHTML = '';
    cell.appendChild(container);
    cell.classList.add('rolling');
    setTimeout(() => {
      cell.classList.remove('rolling');
      cell.textContent = nextText;
    }, 350);
  } catch {
    cell.textContent = nextText;
  }
}

/* ============================================================
   ALPINE.JS APP
   ============================================================ */
window.Alpine = Alpine;

Alpine.data('tennisApp', () => ({
  courts: {},
  publicCourtIds: {},
  prevCourts: {},
  loading: true,
  error: null,
  lastUpdate: null,
  lang: 'pl',
  darkMode: false,
  tournamentName: null,
  ...createHistoryView(),
  activeTab: 'live',
  bracketData: null,
  bracketLoading: false,
  bracketNameMap: {},  // surname -> full_name lookup
  bracketCategory: null, // active bracket category tab
  scheduleData: null,
  scheduleLoading: false,
  scheduleAnnouncement: '',
  scheduleSearch: '',
  scheduleSortMode: 'court',
  scheduleSelectedGroups: {},

  // Tournament history state
  tournaments: [],
  selectedTournamentId: '',
  tournamentHistory: [],
  tournamentBracket: null,
  tournamentSchedule: null,
  tournamentBracketCategory: null,
  privateTournamentAccessKey: '',
  simulationStage: '',
  historySubTab: 'bracket',

  // Live sub-tab state
  liveSubTab: 'scores',

  // Players tab state
  allPlayers: [],
  filteredPlayers: [],
  playerSearch: '',
  playerGender: '',
  playerCountry: '',
  playerCategory: '',
  playersLoading: false,
  selectedPlayerId: null,
  playerProfile: null,
  playerProfileLoading: false,
  profileExpandedTournaments: {},
  _navigating: false,
  _profileIsGlobal: false,
  _playerProfileRequestId: 0,

  /* --- Sorted tournament history (newest first) --- */
  sortedTournamentHistory() {
    return [...this.tournamentHistory].sort((a, b) => {
      const ta = a.ended_ts || a.timestamp || '';
      const tb = b.ended_ts || b.timestamp || '';
      return tb.localeCompare(ta);
    });
  },

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

  async openTournamentHistorySubTab(subTab) {
    this.historySubTab = subTab;
    await this.fetchTournaments();
    if (this.selectedTournamentId) {
      if (subTab === 'schedule') await this.fetchTournamentSchedule(this.selectedTournamentId);
      else if (subTab === 'matches') await this.fetchTournamentHistory(this.selectedTournamentId);
      else await this.fetchTournamentBracket(this.selectedTournamentId);
    }
    this._updateHash(true);
  },

  async selectTournamentBracketCategory(categoryName) {
    this.tournamentBracketCategory = categoryName;
    if (this.selectedTournamentId) await this.fetchTournamentBracket(this.selectedTournamentId);
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

  /* --- Data fetching --- */
  async fetchInitialData() {
    try {
      const data = await publicApi.getSnapshot();
      const courts = data.courts || {};
      this.courts = courts;
      this.publicCourtIds = Object.keys(courts).reduce((acc, courtId) => {
        acc[String(courtId)] = true;
        return acc;
      }, {});
      this.tournamentName = data.tournament_name || null;
      this.loading = false;
      this.lastUpdate = new Date();
    } catch (err) {
      this.error = err.message;
      this.loading = false;
    }
  },

  /* --- Tournament history methods --- */
  async fetchTournaments() {
    try {
      const data = await publicApi.getTournaments();
      if (!data) return;
      this.tournaments = Array.isArray(data) ? data : [];
    } catch { /* ignore */ }
  },

  openTournament(tid) {
    Object.assign(this, getTournamentOpenState(tid));
    this.onTournamentSelected();
    this._updateHash();
  },

  selectedTournamentName() {
    return getSelectedTournamentName(this.tournaments, this.selectedTournamentId, this.tournamentBracket);
  },

  closeTournamentDetail() {
    this.selectedTournamentId = '';
    history.back();
  },

  async onTournamentSelected() {
    const tid = this.selectedTournamentId;
    if (!tid) {
      Object.assign(this, getClearedTournamentDetailState());
      return;
    }
    await Promise.all([
      this.fetchTournamentHistory(tid),
      this.fetchTournamentBracket(tid),
      this.fetchTournamentSchedule(tid)
    ]);
  },

  async fetchTournamentHistory(tid) {
    try {
      const data = await publicApi.getTournamentHistory(tid, this._tournamentAccessQuery());
      if (!data) { this.tournamentHistory = []; return; }
      this.tournamentHistory = Array.isArray(data) ? data : [];
    } catch { this.tournamentHistory = []; }
  },

  async fetchTournamentBracket(tid) {
    try {
      this.tournamentBracket = await publicApi.getTournamentBracket(tid, this._tournamentAccessQuery());
      if (!this.tournamentBracket) { this.tournamentBracket = null; return; }
      this._buildBracketNameMap(this.tournamentBracket);
      const cats = this.tournamentBracketCategories();
      if (cats.length > 0) {
        if (!cats.find(c => c.name === this.tournamentBracketCategory)) {
          this.tournamentBracketCategory = cats[0].name;
        }
      }
    } catch { this.tournamentBracket = null; }
  },

  async fetchTournamentSchedule(tid) {
    try {
      this.tournamentSchedule = await publicApi.getTournamentSchedule(tid, this._tournamentAccessQuery());
      if (!this.tournamentSchedule) { this.tournamentSchedule = null; return; }
    } catch { this.tournamentSchedule = null; }
  },

  _tournamentAccessQuery() {
    return buildTournamentAccessQuery({
      accessKey: this.privateTournamentAccessKey,
      simulationStage: this.simulationStage,
    });
  },

  /* --- Pad sets to 3 columns for consistent table alignment --- */
  padSets(sets) {
    const arr = sets || [];
    const padded = arr.map(s => ({ ...s, played: true }));
    while (padded.length < 3) padded.push({ g1: 0, g2: 0, tb: null, stb: false, played: false });
    return padded;
  },

  tableLegendItems() {
    const b = this.tr().bracket || {};
    return [
      { term: b.wins || 'W', description: b.legendWins || 'wygrane mecze' },
      { term: b.losses || 'L', description: b.legendLosses || 'przegrane mecze' },
      { term: b.setsHeader || 'Sety', description: b.legendSets || 'sety wygrane do przegranych' },
      { term: b.gamesHeader || 'Gemy', description: b.legendGames || 'gemy wygrane do przegranych' },
    ];
  },

  groupStandingsRows(group, siblingGroups = []) {
    return getGroupStandingsRows(group, siblingGroups);
  },

  knockoutPodiumEntries(knockout = []) {
    return getKnockoutPodiumEntries(knockout);
  },

  isFinalPhase(phase) {
    return isFinalBracketPhase(phase);
  },

  knockoutPhaseClass(phase) {
    return getKnockoutPhaseClass(phase);
  },

  formatKnockoutScore(slot) {
    return this.describeBracketSetsForSpeech(slot?.sets || []);
  },

  bracketGroupTableAriaLabel(groupName) {
    return fmt(this.tr().bracket?.groupTableLabel || 'Tabela grupy {group}', {
      group: groupName || '—',
    });
  },

  bracketTreeAriaLabel(categoryName) {
    return fmt(this.tr().bracket?.treeLabel || 'Drabinka {category}', {
      category: this.bracketCategoryLabel(categoryName) || categoryName || '—',
    });
  },

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

  groupMatchAria(match, groupName, index = 0) {
    const intro = fmt(this.acc().groupMatch || '{group}, mecz {number}', {
      group: this.translateCategory(groupName || '') || groupName || '—',
      number: index + 1,
    });
    return this.buildCompletedMatchAria({
      intro: [intro],
      playerA: this.resolveBracketName(match?.player_a),
      playerB: this.resolveBracketName(match?.player_b),
      winnerName: this.resolveBracketName(match?.winner),
      scoreText: this.describeBracketSetsForSpeech(match?.sets || []),
    });
  },

  knockoutMatchAria(slot, phase, index = 0) {
    const phaseName = this.translateCategory(phase || (this.tr().bracket?.knockoutTitle || 'Faza pucharowa'));
    const intro = fmt(this.acc().stageMatch || '{phase}, mecz {number}', {
      phase: phaseName,
      number: index + 1,
    });
    return this.buildCompletedMatchAria({
      intro: [intro],
      playerA: this.resolveBracketName(slot?.player1),
      playerB: this.resolveBracketName(slot?.player2),
      winnerName: this.resolveBracketName(slot?.winner),
      scoreText: this.formatKnockoutScore(slot),
    });
  },

  async fetchBracket() {
    this.bracketLoading = true;
    try {
      this.bracketData = await publicApi.getActiveBracket();
      if (!this.bracketData) { this.bracketData = null; return; }
      // Build name map from bracket group matches (match names → surname lookup)
      this._buildBracketNameMap(this.bracketData);
      // Auto-select category from pending hash or first
      const cats = this.bracketCategories();
      if (this._pendingCategory && cats.find(c => c.name === this._pendingCategory)) {
        this.bracketCategory = this._pendingCategory;
        this._pendingCategory = null;
      } else if (cats.length > 0 && !cats.find(c => c.name === this.bracketCategory)) {
        this.bracketCategory = cats[0].name;
      }
    } catch { this.bracketData = null; }
    finally { this.bracketLoading = false; }
  },

  async fetchSchedule() {
    this.scheduleLoading = true;
    try {
      this.scheduleData = await publicApi.getActiveSchedule();
      if (!this.scheduleData) { this.scheduleData = null; return; }
      const matchCount = this.scheduleMatchCount(this.scheduleData);
      this.scheduleAnnouncement = `${this.scheduleText().updated}: ${matchCount}`;
    } catch {
      this.scheduleData = null;
    } finally {
      this.scheduleLoading = false;
    }
  },

  scheduleText() {
    const fallback = TRANSLATIONS.pl.schedule || {};
    return { ...fallback, ...(this.tr().schedule || {}) };
  },

  scheduleModuleOptions() {
    return {
      sortMode: this.scheduleSortMode,
      search: this.scheduleSearch,
      lang: this.lang || 'pl',
      labels: this.scheduleText(),
      courtLabelPattern: this.tr().courtLabel || 'Kort {court}',
      courtLabel: (match) => this.scheduleCourtLabel(match),
      resolveName: (name) => this.resolveBracketName(name),
      translateCategory: (name) => this.translateCategory(name),
    };
  },

  scheduleDays(data = this.scheduleData) {
    return getScheduleDays(data);
  },

  scheduleMatchCount(data = this.scheduleData) {
    return getScheduleMatchCount(data);
  },

  scheduleVisibleDays(data = this.scheduleData) {
    return this.schedulePreparedDays(data);
  },

  schedulePreparedDays(data = this.scheduleData) {
    return getSchedulePreparedDays(data, {
      buildGroups: (day) => this.scheduleGroups(day),
      currentDate: this.scheduleCurrentDate(),
    });
  },

  scheduleCurrentDate() {
    return getScheduleCurrentDate();
  },

  scheduleDayBucket(day) {
    return getScheduleDayBucket(day, this.scheduleCurrentDate());
  },

  schedulePrimaryDays(data = this.scheduleData) {
    return getSchedulePrimaryDays(this.schedulePreparedDays(data));
  },

  schedulePastDays(data = this.scheduleData) {
    return getSchedulePastDays(this.schedulePreparedDays(data));
  },

  scheduleArchivedDaysLabel(count) {
    return formatScheduleArchivedDaysLabel(count, {
      custom: this.tr().schedule?.archivedDaysLabel,
      lang: this.lang,
    });
  },

  scheduleGroups(day) {
    return buildScheduleGroups(day, this.scheduleModuleOptions());
  },

  scheduleSelectionKey(day) {
    return getScheduleSelectionKey(day, this.scheduleSortMode);
  },

  scheduleActiveGroup(day) {
    const groups = Array.isArray(day?.groups) ? day.groups : [];
    if (!groups.length) return null;
    const key = this.scheduleSelectionKey(day);
    const selectedId = this.scheduleSelectedGroups[key];
    return groups.find((group) => group.id === selectedId) || groups[0];
  },

  scheduleActiveGroupId(day) {
    return this.scheduleActiveGroup(day)?.id || '';
  },

  selectScheduleGroup(day, groupId) {
    if (!day || !groupId) return;
    this.scheduleSelectedGroups = {
      ...this.scheduleSelectedGroups,
      [this.scheduleSelectionKey(day)]: groupId,
    };
  },

  scheduleTablistLabel() {
    return this.scheduleSortMode === 'category'
      ? this.scheduleText().tabsLabelCategory
      : this.scheduleText().tabsLabelCourt;
  },

  scheduleDomId(prefix, day, group) {
    return getScheduleDomId(prefix, day, group);
  },

  focusScheduleGroupTab(day, group) {
    if (!day || !group) return;
    requestAnimationFrame(() => {
      document.getElementById(this.scheduleDomId('schedule-tab', day, group))?.focus();
    });
  },

  focusScheduleAdjacentGroup(day, currentGroupId, direction) {
    const groups = Array.isArray(day?.groups) ? day.groups : [];
    if (!groups.length) return;
    let index = groups.findIndex((group) => group.id === currentGroupId);
    if (index < 0) index = 0;
    const nextIndex = (index + direction + groups.length) % groups.length;
    const nextGroup = groups[nextIndex];
    this.selectScheduleGroup(day, nextGroup.id);
    this.focusScheduleGroupTab(day, nextGroup);
  },

  focusScheduleEdgeGroup(day, edge) {
    const groups = Array.isArray(day?.groups) ? day.groups : [];
    if (!groups.length) return;
    const target = edge === 'last' ? groups[groups.length - 1] : groups[0];
    this.selectScheduleGroup(day, target.id);
    this.focusScheduleGroupTab(day, target);
  },

  scheduleFlattenDay(day) {
    return flattenScheduleDay(day);
  },

  scheduleGroupMeta(match, mode) {
    return getScheduleGroupMeta(match, mode, this.scheduleModuleOptions());
  },

  scheduleCourtTabLabel(match) {
    return getScheduleCourtTabLabel(match, this.scheduleModuleOptions());
  },

  scheduleCategoryLabel(match) {
    return getScheduleCategoryLabel(match, this.scheduleModuleOptions());
  },

  normalizeScheduleText(value) {
    return normalizeScheduleText(value);
  },

  scheduleMatchMatchesQuery(match, query) {
    return doesScheduleMatchMatchQuery(match, query, this.scheduleModuleOptions());
  },

  compareScheduleMatches(left, right) {
    return compareScheduleMatchesData(left, right, {
      courtLabel: (match) => this.scheduleCourtLabel(match),
      lang: this.lang || 'pl',
    });
  },

  formatScheduleDate(value) {
    return formatScheduleDateValue(value, this.lang || 'pl');
  },

  formatScheduleTime(value) {
    return formatScheduleTimeValue(value, this.scheduleText());
  },

  scheduleCourtLabel(match) {
    if (match?.court_label) return this.localizeCourtLabel(match.court_label);
    if (match?.court_id && this.courts?.[match.court_id]) return this.getCourtDisplayLabel(match.court_id);
    if (match?.court_id) return this.localizeCourtLabel(match.court_id);
    return this.scheduleText().courtTbd;
  },

  scheduleStatusLabel(status) {
    return getScheduleStatusLabel(status, this.scheduleText());
  },

  scheduleMatchAria(match) {
    const labels = this.scheduleText();
    return [
      `${labels.time}: ${this.formatScheduleTime(match?.scheduled_time)}`,
      `${labels.court}: ${this.scheduleCourtLabel(match)}`,
      `${labels.category}: ${this.scheduleCategoryLabel(match)}`,
      `${labels.phase}: ${this.translatePhase(match?.phase || '')}`,
      `${labels.match}: ${match?.player1_name || ''} ${this.acc().versus || 'kontra'} ${match?.player2_name || ''}`,
      `${labels.status}: ${this.scheduleStatusLabel(match?.status)}`,
      match?.notes_public ? `${labels.notes}: ${match.notes_public}` : '',
    ].filter(Boolean).join('. ');
  },

  switchToBracket(cat) {
    this.activeTab = 'live';
    this.liveSubTab = 'bracket';
    if (cat) this.bracketCategory = cat;
    this.fetchBracket();
    this._updateHash();
  },

  /* --- Players methods --- */
  async fetchAllPlayers() {
    this.playersLoading = true;
    try {
      const data = await publicApi.getAllPlayers();
      if (!data) { this.allPlayers = []; this.filteredPlayers = []; return; }
      this.allPlayers = Array.isArray(data) ? data : [];
      // Build name map from all players (surname -> full name)
      for (const p of this.allPlayers) {
        const name = p.name || '';
        if (name.includes(' ')) {
          const parts = name.trim().split(/\s+/);
          const surname = parts[parts.length - 1];
          this.bracketNameMap[surname] = name;
        }
      }
      this.filterPlayers();
    } catch { this.allPlayers = []; this.filteredPlayers = []; }
    finally { this.playersLoading = false; }
  },

  filterPlayers() {
    this.filteredPlayers = filterPlayersList(this.allPlayers, {
      search: this.playerSearch,
      gender: this.playerGender,
      country: this.playerCountry,
      category: this.playerCategory,
    });
  },

  playerCountryOptions() {
    return getPlayerCountryOptions(this.allPlayers);
  },

  playerCategoryOptions() {
    return getPlayerCategoryOptions(this.allPlayers);
  },

  /* --- Player Profile --- */
  openPlayerProfile(id, isGlobal = false) {
    this.selectedPlayerId = id;
    this._profileIsGlobal = isGlobal;
    this.playerProfile = null;
    this.profileExpandedTournaments = {};
    this.fetchPlayerProfile(id, isGlobal ? 'global' : 'local');
    this._updateHash();
  },

  closePlayerProfile() {
    this.selectedPlayerId = null;
    this._profileIsGlobal = false;
    this.playerProfile = null;
    this.profileExpandedTournaments = {};
    history.back();
  },

  async fetchPlayerProfile(id, mode = 'auto') {
    const requestId = ++this._playerProfileRequestId;
    this.playerProfileLoading = true;
    try {
      const requestedMode = normalizePlayerProfileMode(mode);
      const candidates = getPlayerProfileLookupCandidates(this.allPlayers, id, requestedMode);

      for (const isGlobal of candidates) {
        try {
          const data = await publicApi.getPlayerProfile(id, isGlobal);
          if (!data) continue;
          if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
          this.playerProfile = data;
          this._profileIsGlobal = isGlobal;
          if (requestedMode === 'auto') this._updateHash(true);
          return;
        } catch {
          continue;
        }
      }

      if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
      this.playerProfile = null;
      this._profileIsGlobal = false;
    } catch {
      if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
      this.playerProfile = null;
      this._profileIsGlobal = false;
    } finally {
      if (requestId === this._playerProfileRequestId) this.playerProfileLoading = false;
    }
  },

  toggleProfileTournament(tid) {
    this.profileExpandedTournaments[tid] = !this.profileExpandedTournaments[tid];
  },

  profileMedalEmoji(medal) {
    return getProfileMedalEmoji(medal);
  },

  profileWinRate() {
    return getProfileWinRate(this.playerProfile);
  },

  resolveBracketName(surname) {
    if (!surname) return '';
    return this.bracketNameMap[surname] || surname;
  },

  translatePhase(phase) {
    if (!phase) return '';
    const t = this.tr();
    const map = {
      'Grupowa': t.history?.phaseGroup || 'Group',
      'Pucharowa': t.history?.phaseKnockout || 'Knockout',
      'Faza grupowa': t.playerProfile?.groupPhase || t.history?.phaseGroup || 'Group phase',
      'Faza pucharowa': t.playerProfile?.knockoutPhase || t.history?.phaseKnockout || 'Knockout phase',
    };
    return this.translateCategory(map[phase] || phase);
  },

  translateCategory(name) {
    if (!name) return '';
    const t = this.tr();
    const women = t.history?.catWomen || 'Women';
    const men = t.history?.catMen || 'Men';
    const semifinal = t.bracket?.semifinal || 'Semifinal';
    const final_ = t.bracket?.finalLabel || 'Final';
    const placeMatch = t.bracket?.placeMatch || '{forPlace} {number}. {place}';
    const forPlace = t.bracket?.forPlace || 'for';
    const place = t.playerProfile?.place || 'place';
    return name
      .replace(/Kobiety/g, women)
      .replace(/Mężczyźni/g, men)
      .replace(/Półfinał/g, semifinal)
      .replace(/Finał/g, final_)
      .replace(/o (\d+)\. miejsce/g, (_, number) => fmt(placeMatch, { number, forPlace, place }));
  },

  bracketCategoryLabel(name) {
    const t = this.tr();
    return getBracketCategoryLabel(name, {
      translateCategory: (value) => this.translateCategory(value),
      womenLabel: t.history?.catWomen || 'Women',
      menLabel: t.history?.catMen || 'Men',
    });
  },

  compareBracketCategoryNames(leftName, rightName) {
    return compareBracketCategoryNamesData(leftName, rightName, {
      getCategoryLabel: (name) => this.bracketCategoryLabel(name),
      lang: this.lang || 'pl',
    });
  },

  _buildBracketNameMap(data) {
    if (!data) return;
    // From group matches: map player names to surnames for lookup
    for (const g of (data.groups || [])) {
      for (const m of (g.matches || [])) {
        for (const pName of [m.player_a, m.player_b]) {
          if (pName && pName.includes(' ')) {
            const parts = pName.trim().split(/\s+/);
            const surname = parts[parts.length - 1];
            this.bracketNameMap[surname] = pName;
          }
        }
      }
    }
    // From knockout slots
    if (data.knockout) {
      for (const slots of Object.values(data.knockout)) {
        for (const slot of (Array.isArray(slots) ? slots : [])) {
          for (const pName of [slot.player1, slot.player2, slot.winner]) {
            if (pName && pName.includes(' ')) {
              const parts = pName.trim().split(/\s+/);
              const surname = parts[parts.length - 1];
              this.bracketNameMap[surname] = pName;
            }
          }
        }
      }
    }
  },

  /* --- Bracket category helpers --- */
  bracketCategories() {
    return buildBracketCategories(this.bracketData, {
      compareCategoryNames: (left, right) => this.compareBracketCategoryNames(left.name, right.name),
    });
  },

  activeBracketCategory() {
    const cats = this.bracketCategories();
    const resolved = resolveActiveBracketCategory(cats, this.bracketCategory);
    this.bracketCategory = resolved.selectedName;
    return resolved.category;
  },

  tournamentBracketCategories() {
    return buildBracketCategories(this.tournamentBracket, {
      compareCategoryNames: (left, right) => this.compareBracketCategoryNames(left.name, right.name),
    });
  },

  activeTournamentBracketCategory() {
    const cats = this.tournamentBracketCategories();
    const resolved = resolveActiveBracketCategory(cats, this.tournamentBracketCategory);
    this.tournamentBracketCategory = resolved.selectedName;
    return resolved.category;
  },

  connectSSE() {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('court_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        const courtId = String(data.court_id);
        if (!this.publicCourtIds[courtId]) return;
        const prev = this.courts[courtId];

        // Trigger DOM animations after Alpine renders
        this.$nextTick(() => {
          this.animateChanges(courtId, prev, data);
        });

        this.prevCourts[courtId] = prev ? { ...prev } : {};
        this.courts[courtId] = data;
        this.lastUpdate = new Date();
        // Refresh history when a match finishes
        if (prev?.match_status?.active && !data?.match_status?.active) {
          this.fetchHistory();
          if (this.liveSubTab === 'schedule') this.fetchSchedule();
        }
      } catch { /* ignore parse errors */ }
    });

    eventSource.onerror = () => {
      this.error = 'Połączenie przerwane';
      setTimeout(() => this.connectSSE(), 5000);
    };
  },

  /* --- DOM animations on score change --- */
  animateChanges(courtId, prev, next) {
    if (!prev) return;
    const sides = ['A', 'B'];

    // Points animation
    sides.forEach(side => {
      const prevPts = this.resolveDisplayPoints(prev, side);
      const nextPts = this.resolveDisplayPoints(next, side);
      if (prevPts !== nextPts) {
        const el = document.getElementById(`k${courtId}-pts-${side}`);
        if (el) {
          animatePointsChange(el, prevPts, nextPts);
          flash(el);
          if (nextPts === 'ADV' || nextPts === '40') {
            el.classList.add('flip-strong');
            setTimeout(() => el.classList.remove('flip-strong'), 450);
          }
        }
      }
    });

    // Set score animation
    for (let s = 1; s <= 3; s++) {
      sides.forEach(side => {
        const key = `set${s}`;
        const prevVal = prev[side]?.[key];
        const nextVal = next[side]?.[key];
        if (nextVal !== undefined && nextVal !== prevVal) {
          const el = document.getElementById(`k${courtId}-s${s}-${side}`);
          if (el) flash(el);
        }
      });
    }

    // Player name animation
    sides.forEach(side => {
      const prevName = prev[side]?.full_name || prev[side]?.surname;
      const nextName = next[side]?.full_name || next[side]?.surname;
      if (nextName && prevName !== nextName) {
        const el = document.getElementById(`k${courtId}-name-${side}`);
        if (el) flash(el);
      }
    });
  },

  resolveDisplayPoints(court, side) {
    return resolveDisplayPointsForCourt(court, side);
  },

  /* --- Court helpers --- */
  getCourtIds() {
    return getSortedCourtIds(this.courts);
  },

  getCourtDisplayLabel(courtId) {
    return getLocalizedCourtDisplayLabel(this.courts, courtId, (court) => this.t('courtLabel', { court }));
  },

  localizeCourtLabel(label, forcePrefix = false) {
    return localizeCourtLabelValue(label, {
      forcePrefix,
      formatCourtLabel: (court) => this.t('courtLabel', { court }),
    });
  },

  hasActiveCourts() {
    return Object.values(this.courts).some(c => c.match_status?.active);
  },

  isMatchActive(courtId) {
    return this.courts[courtId]?.match_status?.active || false;
  },

  /* --- Player name with fallback --- */
  getPlayerName(courtId, side) {
    const player = this.courts[courtId]?.[side];
    if (player) {
      const full = player.full_name;
      if (full && String(full).trim()) return String(full).trim();
      const surname = player.surname;
      if (surname && surname !== '-') return surname;
    }
    const tr = this.tr();
    return side === 'A' ? tr.players.defaultA : tr.players.defaultB;
  },

  /* --- Heading aria for screen readers --- */
  getHeadingAria(courtId) {
    const court = this.courts[courtId] || {};
    const courtLabel = court.tournament_name
      ? `${court.tournament_name}: ${this.getCourtDisplayLabel(courtId)}`
      : this.getCourtDisplayLabel(courtId);
    const nameA = this.getPlayerName(courtId, 'A');
    const nameB = this.getPlayerName(courtId, 'B');
    const vs = this.acc().versus || 'kontra';
    const serve = this.courts[courtId]?.serve;
    const servingText = this.acc().serving || 'serwuje';
    const labelA = serve === 'A' ? `${nameA} (${servingText})` : nameA;
    const labelB = serve === 'B' ? `${nameB} (${servingText})` : nameB;
    return `${courtLabel}: ${labelA} ${vs} ${labelB}`;
  },

  /* --- Tiebreak detection --- */
  isTiebreak(courtId) {
    return isTiebreakForCourt(this.courts[courtId]);
  },

  getRegularSetWins(courtId) {
    return getRegularSetWinsForCourt(this.courts[courtId]);
  },

  isDecidingSuperTiebreak(courtId) {
    return isDecidingSuperTiebreakForCourt(this.courts[courtId]);
  },

  isSuperTiebreak(courtId) {
    return isSuperTiebreakForCourt(this.courts[courtId]);
  },

  /* --- Points display --- */
  getDisplayPoints(courtId, side) {
    return this.resolveDisplayPoints(this.courts[courtId], side);
  },

  getPointsLabel(courtId) {
    const tr = this.tr();
    const cols = tr.table?.columns || {};
    if (this.isSuperTiebreak(courtId)) return cols.superTieBreak || 'Super TB';
    if (this.isTiebreak(courtId)) return cols.tieBreak || 'Tie Break';
    return cols.points || 'Punkty';
  },

  /* --- Set scores --- */
  getSetIndices(courtId) {
    return getSetIndicesForCourt(this.courts[courtId]);
  },

  /** Returns true if this court has a super tiebreak entry in sets_detail */
  hasSuperTiebreak(courtId) {
    return hasSuperTiebreakForCourt(this.courts[courtId]);
  },

  /** Get super tiebreak scores {a, b} or null */
  getSuperTiebreakScore(courtId) {
    return getSuperTiebreakScoreForCourt(this.courts[courtId]);
  },

  /** Get tiebreak loser points for a specific set index (1-based) */
  getTiebreakInfo(courtId, setIdx) {
    return getTiebreakInfoForCourt(this.courts[courtId], setIdx);
  },

  getStoredSetScore(court, side, setIdx) {
    return getStoredSetScoreForCourt(court, side, setIdx);
  },

  getSetScore(courtId, side, setIdx) {
    return getSetScoreForCourt(this.courts[courtId], side, setIdx);
  },

  getCurrentSetLabel(courtId) {
    const tr = this.tr();
    const currentSet = this.courts[courtId]?.current_set || 1;
    if (this.isSuperTiebreak(courtId)) {
      return tr.table?.columns?.superTieBreak || tr.superTieBreakLabel || 'Super TB';
    }
    return (tr.footer?.set || 'Set') + ' ' + currentSet;
  },

  /* --- Screen reader summary (the key accessibility feature) --- */
  getScoreSummary(courtId) {
    const court = this.courts[courtId];
    if (!court) return '';
    const a = this.acc();
    const isTie = this.isTiebreak(courtId);
    const isSuper = this.isSuperTiebreak(courtId);
    const currentSet = parseInt(court.current_set) || 1;

    // Serving info
    const serve = court.serve;
    const servingText = a.serving || 'serwuje';
    const servingPart = serve === 'A'
      ? `${this.getPlayerName(courtId, 'A')} ${servingText}`
      : serve === 'B'
        ? `${this.getPlayerName(courtId, 'B')} ${servingText}`
        : null;

    // Points label
    const pointsLabel = isTie
      ? (isSuper ? (a.superTieBreak || 'super tie-break') : (a.tieBreak || 'tie-break'))
      : (a.points || 'punkty');

    const ptsA = this.getDisplayPoints(courtId, 'A');
    const ptsB = this.getDisplayPoints(courtId, 'B');

    const parts = [];
    if (servingPart) parts.push(servingPart);
    parts.push(`${pointsLabel} ${this.spokenScore(ptsA, ptsB)}`);

    // Set scores
    const setIndices = this.getSetIndices(courtId);
    setIndices.forEach(idx => {
      const sA = this.getSetScore(courtId, 'A', idx);
      const sB = this.getSetScore(courtId, 'B', idx);
      const numA = parseInt(sA) || 0;
      const numB = parseInt(sB) || 0;
      const include = idx === 1 || currentSet >= idx || numA > 0 || numB > 0;
      if (!include) return;

      const setLabel = isSuper && idx === currentSet
        ? (a.superTieBreak || 'super tie-break')
        : fmt(a.set || 'Set {number}', { number: idx });
      const isActive = currentSet === idx;
      const segment = isActive
        ? `${setLabel}, ${a.active || 'aktywny'}, ${this.spokenScore(sA, sB)}`
        : `${setLabel}, ${this.spokenScore(sA, sB)}`;
      parts.push(segment);
    });

    return parts.join('. ').trim();
  },

  /* --- Score helpers (legacy) --- */
  getScore(courtId, player) {
    const court = this.courts[courtId];
    if (!court) return { sets: [], points: '-' };
    const playerData = court[player];
    if (!playerData) return { sets: [], points: '-' };
    return {
      sets: playerData.sets || [],
      points: playerData.points || '0'
    };
  },

  formatTime(seconds) {
    return formatDuration(seconds);
  },

  /* --- History view methods are composed from modules/historyView.js --- */
}));

Alpine.start();

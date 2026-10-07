import Alpine from 'alpinejs';
import './styles/fonts.css';
import './styles/organizer-base.css';
import './styles/organizer.css';
import { call, CallError, toSignIn } from './organizer/api.js';
import { LANGUAGES, formatDate, pickLanguage, plural, rememberLanguage, storedLanguage, supported, takeChoice, translate } from './organizer/i18n/index.js';
import { daysKey, daysLeft, planState, yearLimitReached, yearUsage } from './organizer/plan.js';
import { createPlayersView } from './organizer/playersView.js';
import { createSeriesLogoView } from './organizer/seriesLogo.js';
import { ORGANIZER_TOKEN_KEY, TIERS, dateRange, tierLabel } from './organizer/route.js';
import { TOURNAMENT_TABS, organizerHash, parseOrganizerHash } from './organizer/routing.js';
import { createTournamentView } from './organizer/tournamentView.js';
import seriesHomeHtml from './organizer/partials/seriesHome.html?raw';
import tournamentHtml from './organizer/partials/tournament.html?raw';
import tabSettingsHtml from './organizer/partials/tabSettings.html?raw';
import tabCategoriesHtml from './organizer/partials/tabCategories.html?raw';
import tabPlayersHtml from './organizer/partials/tabPlayers.html?raw';
import tabCourtsHtml from './organizer/partials/tabCourts.html?raw';
import tabLogHtml from './organizer/partials/tabLog.html?raw';
import logoBoxesHtml from './organizer/partials/logoBoxes.html?raw';
import { mountPartials } from './shared/partials.js';
import { storageGet } from './shared/signInForm.js';

mountPartials(document.body, {
  seriesHome: seriesHomeHtml,
  tournament: tournamentHtml,
  tabSettings: tabSettingsHtml,
  tabCategories: tabCategoriesHtml,
  tabPlayers: tabPlayersHtml,
  tabCourts: tabCourtsHtml,
  tabLog: tabLogHtml,
  logoBoxes: logoBoxesHtml,
});

const emptyDraft = () => ({ name: '', start_date: '', end_date: '', city: '', country: '', court_count: 4, tier: '', is_public: true, office_password: '' });

Alpine.data('organizerApp', () => ({
  ...createTournamentView(),
  ...createPlayersView(),
  ...createSeriesLogoView(),
  lang: pickLanguage({ search: window.location.search, stored: storedLanguage(), navigatorLanguages: navigator.languages || [] }),
  loading: true,
  error: null,
  account: null,
  contactEmail: 'organizers@blindtennis.app',
  seriesList: [],
  currentId: null,
  route: { slug: '', tournamentId: null, tab: '' },
  draft: emptyDraft(),
  draftOpen: false,
  draftError: null,

  /** Text in the person's language. */
  ot(key, vars) { return translate(this.lang, key, vars); },
  /** A counted text, the language's own plural form. */
  tp(key, n, vars) { return plural(this.lang, key, n, vars); },
  /** A message ({key, vars}) as text; '' when there is none. */
  say(message) { return message?.key ? this.ot(message.key, message.vars) : ''; },
  languages() { return LANGUAGES; },
  date(iso) { return formatDate(this.lang, iso); },

  async init() {
    this.applyLanguage(this.lang);
    await this.reloadSeries();
    const chosen = takeChoice();
    if (chosen && chosen !== this.account?.language) await this.setLanguage(chosen);
    else if (supported(this.account?.language)) this.applyLanguage(this.account.language);
    this.loading = false;
    window.addEventListener('hashchange', () => this.applyHash());
    this.applyHash();
  },

  applyLanguage(code) {
    this.lang = supported(code) || this.lang;
    rememberLanguage(this.lang);
    document.documentElement.lang = this.lang;
    document.title = this.ot('pageTitlePanel');
  },

  /** The person's choice: this page at once, and every mail they get from now on. */
  async setLanguage(code) {
    this.applyLanguage(code);
    try { await call('/organizer/api/me', 'PUT', { language: this.lang }); } catch { /* the page still follows */ }
  },

  async reloadSeries() {
    try {
      const data = await call('/organizer/api/me');
      this.account = data.account;
      this.contactEmail = data.contact_email || this.contactEmail;
      this.seriesList = data.series || [];
    } catch (error) {
      this.error = error instanceof CallError ? { key: 'loadFailed' } : null;
    }
  },

  applyHash() {
    const route = parseOrganizerHash(window.location.hash);
    const item = this.seriesList.find((row) => row.slug === route.slug) || this.seriesList[0];
    if (!item) return;
    this.currentId = item.id;
    if (route.slug !== item.slug) {
      history.replaceState(null, '', organizerHash({ slug: item.slug }));
      route.slug = item.slug;
      route.tournamentId = null;
    }
    const changedTournament = route.tournamentId !== this.route.tournamentId;
    this.route = route;
    if (!route.tournamentId) {
      this.t = null;
      return;
    }
    const load = changedTournament || !this.t ? this.loadTournament(route.tournamentId) : Promise.resolve();
    load.then(() => this.loadTab(route.tab));
  },

  loadTab(tab) {
    if (!this.t) return;
    if (tab === 'historia') this.loadLog();
    if (tab === 'kategorie') this.loadCategories();
    if (tab === 'zawodnicy') this.loadEntries();
  },

  go(tournamentId = null, tab = '') {
    window.location.hash = organizerHash({ slug: this.current()?.slug, tournamentId, tab });
  },

  switchSeries(id) {
    const item = this.seriesList.find((row) => row.id === Number(id));
    if (item) window.location.hash = organizerHash({ slug: item.slug });
  },

  current() {
    return this.seriesList.find((item) => item.id === this.currentId) || null;
  },

  readOnlySeries() {
    return planState(this.current()?.valid_until) === 'ended';
  },

  endingSoonText() {
    const until = this.current()?.valid_until;
    if (planState(until) !== 'ending') return '';
    const days = daysKey(daysLeft(until));
    return this.ot('endingBanner', { date: this.date(until), days: this.ot(days.key, { n: days.n }) });
  },

  thisYear() { return new Date().getFullYear(); },
  yearUsageText() {
    const usage = yearUsage(this.current(), this.thisYear());
    return usage ? this.ot('yearUsage', { year: this.thisYear(), ...usage }) : '';
  },
  yearLimitReached() { return yearLimitReached(this.current(), this.thisYear()); },

  tabs() { return TOURNAMENT_TABS; },
  tiers() { return TIERS.map((tier) => ({ value: tier, label: tierLabel(tier) })); },
  roleLabel(role) { return this.ot(role === 'owner' ? 'roleOwner' : 'roleEditor'); },
  tierLabel,
  dateRange,

  async createTournament() {
    this.draftError = null;
    if (!this.draft.name.trim() || !this.draft.start_date || !this.draft.end_date) {
      this.draftError = { key: 'fillNameDates' };
      return;
    }
    try {
      const body = await call(`/organizer/api/series/${this.currentId}/tournaments`, 'POST', this.draft);
      this.draft = emptyDraft();
      this.draftOpen = false;
      await this.reloadSeries();
      this.go(body.id);
    } catch (error) {
      this.draftError = error instanceof CallError ? { key: error.key, vars: error.vars } : { key: 'createFailed' };
    }
  },

  signOut() {
    toSignIn('out');
  },
}));

// Without a session the sign-in page takes over; the head script usually got there first.
if (storageGet(ORGANIZER_TOKEN_KEY)) Alpine.start();
else toSignIn('');

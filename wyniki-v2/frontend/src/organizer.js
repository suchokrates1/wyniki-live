import Alpine from 'alpinejs';
import './styles/fonts.css';
import './styles/admin.css';
import './styles/admin-list.css';
import './styles/admin-forms.css';
import './styles/organizer.css';
import { call, CallError, toSignIn } from './organizer/api.js';
import { createPlayersView } from './organizer/playersView.js';
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
});

const ROLE_LABELS = { owner: 'właściciel', editor: 'edytor' };
const emptyDraft = () => ({ name: '', start_date: '', end_date: '', city: '', country: '', court_count: 4, tier: '', is_public: true, office_password: '' });

Alpine.data('organizerApp', () => ({
  ...createTournamentView(),
  ...createPlayersView(),
  loading: true,
  error: '',
  account: null,
  seriesList: [],
  currentId: null,
  route: { slug: '', tournamentId: null, tab: '' },
  draft: emptyDraft(),
  draftOpen: false,
  draftError: '',

  async init() {
    await this.reloadSeries();
    this.loading = false;
    window.addEventListener('hashchange', () => this.applyHash());
    this.applyHash();
  },

  async reloadSeries() {
    try {
      const data = await call('/organizer/api/me');
      this.account = data.account;
      this.seriesList = data.series || [];
    } catch (error) {
      this.error = error instanceof CallError ? 'Nie udało się wczytać panelu. Odśwież stronę.' : '';
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
    const until = this.current()?.valid_until || '';
    return Boolean(until) && until < new Date().toISOString().slice(0, 10);
  },

  tabs() { return TOURNAMENT_TABS; },
  tiers() { return TIERS.map((tier) => ({ value: tier, label: tierLabel(tier) })); },

  tournamentCountText() {
    const count = this.current()?.tournaments.length || 0;
    if (count === 1) return '1 turniej';
    const lastTwo = count % 100;
    const few = count % 10 >= 2 && count % 10 <= 4 && (lastTwo < 12 || lastTwo > 14);
    return `${count} ${few ? 'turnieje' : 'turniejów'}`;
  },

  roleLabel(role) { return ROLE_LABELS[role] || role; },
  tierLabel,
  dateRange,

  async createTournament() {
    this.draftError = '';
    if (!this.draft.name.trim() || !this.draft.start_date || !this.draft.end_date) {
      this.draftError = 'Uzupełnij nazwę i obie daty.';
      return;
    }
    try {
      const body = await call(`/organizer/api/series/${this.currentId}/tournaments`, 'POST', this.draft);
      this.draft = emptyDraft();
      this.draftOpen = false;
      await this.reloadSeries();
      this.go(body.id);
    } catch (error) {
      this.draftError = error instanceof CallError ? error.message : 'Nie udało się założyć turnieju.';
    }
  },

  signOut() {
    toSignIn('out');
  },
}));

// Without a session the sign-in page takes over; the head script usually got there first.
if (storageGet(ORGANIZER_TOKEN_KEY)) Alpine.start();
else toSignIn('');

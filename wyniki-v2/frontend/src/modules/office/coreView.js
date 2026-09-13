import { translateStoredScheduleLabel } from '../../shared/labelDisplay.js';
import { formatTeamLabelForWrap } from '../../shared/teamDisplay.js';
import { officeAuthHeaders } from './api.js';
import { defaultOfficeForm, defaultOfficeScheduleForm } from './forms.js';

export function createOfficeCoreView() {
  return {
    slot: 1,

    token: '',

    authPassword: '',

    showAuthPassword: false,

    authError: '',

    metaLoading: false,

    dashboard: null,

    tournamentMeta: null,
    officeTournaments: [],
    officeTournamentId: null,

    loading: false,

    authLoading: false,

    activeTab: 'planning',

    officeRailResting: false,

    addMatchOpen: false,

    editMatchOpen: false,

    notificationsEnabled: true,

    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',

    seenMatchKeys: [],

    officeNewMatch: defaultOfficeForm(),

    officeEditingMatch: null,

    planningLoading: false,

    planningPlayers: [],

    planningMixedCategories: [],

    tournamentCategories: [],

    planningSelectedCategoryId: null,

    categoryPresetSelected: {},

    categoryPresetDoubles: {},

    categoryCustomLabel: '',

    categoryCustomHints: '',

    categoryCustomDoubles: false,

    categoryEditId: null,

    categoryEditLabel: '',

    categorySetupOpen: true,

    planningGroups: [],

    planningSchedule: [],

    planningCourts: [],

    planningSelectedDivision: '',

    planningGroupCount: 1,

    planningGroupAssignments: {},

    planningTeamAssignments: {},

    planningGroupFormats: {},

    planningTeams: [],
    planningStartNumbers: {},
    planningInspectorShownId: null,
    planningInspectorLeavingId: null,
    planningInspectorLeaveTimer: null,
    planningStartNumbersPending: false,

    planningDragPlayerId: null,

    planningDragTeamId: null,

    planningCategoryFilterEnabled: true,

    planningNewTeam: {
      player1_id: '',
      player2_id: '',
    },

    planningAddTeamOpen: false,

    planningSaving: false,

    planningSaveTimer: null,

    planningEditRevision: 0,

    planningStep1Collapsed: false,

    planningOpenCardId: null,

    planningManualOpen: false,

    planningDrawerCollapsed: false,

    planningDrawerCategory: '',

    planningDropCell: null,
    officeKnockoutSwapFrom: null,
    planningGroupCountDivision: null,
    planningInspectorDirtyId: null,
    planningLoadedOnce: false,

    planningRematchOpen: false,

    planningPublishing: false,

    planningNewSchedule: defaultOfficeScheduleForm(),

    planningRematchGroupIds: [],

    planningNewPlayer: {
      first_name: '',
      last_name: '',
      category: 'B1',
      gender: '',
      country: '',
    },

    planningAddPlayerOpen: false,

    autoConfig: null,

    autoCourts: [],

    autoBands: [],

    autoStartTime: '09:30',

    autoEndTime: '18:00',

    autoB1Courts: [],

    autoDayDate: '',

    autoPhaseScope: 'group',

    autoProposal: null,

    autoLoading: false,

    autoDragId: null,

    toast: {
      show: false,
      message: '',
      type: 'info',
    },

    quickInfoMessage: '',

    quickInfoActive: true,

    quickInfoUpdatedAt: null,

    quickInfoSaving: false,

    quickInfoDirty: false,

    officeEventSource: null,

    officeSseReconnectTimer: null,

    officeSseRefreshTimer: null,

    officeFallbackPollTimer: null,

    officeSseFailures: 0,

    officeSseState: 'idle',

    pendingRemoteRefresh: false,

    get isAuthenticated() {
      return !!this.token;
    },

    get officeMatches() {
      return this.dashboard?.matches || [];
    },

    get officeGroups() {
      return this.dashboard?.progress?.groups || [];
    },

    get officeKnockout() {
      return this.dashboard?.progress?.knockout || {
        expected_matches: 0,
        finished_matches: 0,
        remaining_matches: 0,
        ready_matches: 0,
        matches: [],
      };
    },

    get officeKnockoutMatches() {
      return this.officeKnockout.matches || [];
    },

    get officeSchedule() {
      return this.dashboard?.schedule || [];
    },

    get officeCourts() {
      return this.dashboard?.courts || [];
    },

    init() {
      this.initOfficeLang();
      this.slot = this.resolveSlot();
      this.startOffice();
      window.addEventListener('visibilitychange', () => {
        if (!this.isAuthenticated || document.hidden) return;
        this.officeSseFailures = 0;
        this.connectOfficeSSE();
        this.loadDashboard(false);
      });
      window.addEventListener('pagehide', () => this.stopOfficeSSE());
      window.addEventListener('office-session-expired', async () => {
        if (!this.token) return;
        // The tournament may only have moved to another slot; follow it before giving up.
        if (await this.followOfficeTournamentSlot()) return;
        this.logout(this.ot('errors.sessionExpired'));
      });
    },

    /** /office lists the tournaments; an old /office/<n> link picks that tournament once. */
    async startOffice() {
      const legacySlot = /\/office\/\d+/.test(window.location.pathname) ? this.slot : null;
      await this.loadOfficeTournaments();
      const list = this.officeTournaments;
      let chosen = legacySlot ? list.find((item) => Number(item.slot) === Number(legacySlot)) : null;
      if (!chosen) {
        let stored = null;
        try {
          stored = Number(window.localStorage.getItem('office-tournament-id') || 0) || null;
        } catch {
          stored = null;
        }
        chosen = list.find((item) => Number(item.id) === stored) || list[0] || null;
      }
      if (legacySlot) {
        const query = window.location.search || '';
        window.history.replaceState(null, '', `/office${query}`);
      }
      if (chosen) this.selectOfficeTournament(chosen.id);
      else this.loadMeta();
    },

    async loadOfficeTournaments() {
      try {
        const response = await fetch('/api/office/tournaments');
        const payload = await response.json().catch(() => ({}));
        this.officeTournaments = Array.isArray(payload.tournaments) ? payload.tournaments : [];
      } catch (error) {
        console.error('Failed to load office tournaments:', error);
        this.officeTournaments = [];
      }
      return this.officeTournaments;
    },

    selectOfficeTournament(tournamentId) {
      const chosen = this.officeTournaments.find((item) => Number(item.id) === Number(tournamentId));
      if (!chosen) return;
      if (this.token && Number(this.officeTournamentId) !== Number(chosen.id)) this.logout();
      this.officeTournamentId = Number(chosen.id);
      this.slot = Number(chosen.slot);
      this.tournamentMeta = chosen;
      this.authError = '';
      try {
        window.localStorage.setItem('office-tournament-id', String(chosen.id));
      } catch {
        // private mode: the choice just is not remembered
      }
      this.token = window.sessionStorage.getItem(this.officeTokenKey()) || '';
      this.hydrateNotificationPreferences();
      if (this.token) {
        this.connectOfficeSSE();
        this.openOfficePathStart();
      }
    },

    async followOfficeTournamentSlot() {
      if (!this.officeTournamentId) return false;
      const previous = this.slot;
      await this.loadOfficeTournaments();
      const current = this.officeTournaments.find((item) => Number(item.id) === Number(this.officeTournamentId));
      if (!current || Number(current.slot) === Number(previous)) return false;
      this.slot = Number(current.slot);
      this.tournamentMeta = current;
      try {
        await fetch(`/api/office/${this.slot}/session`, { method: 'POST', headers: this.officeHeaders() });
      } catch (error) {
        console.error('Failed to renew the office stream cookie:', error);
      }
      this.connectOfficeSSE();
      this.loadDashboard(false);
      return true;
    },

    officeTournamentOptionLabel(item) {
      const dates = [item.start_date, item.end_date].filter(Boolean).join(' – ');
      return dates ? `${item.name} (${dates})` : item.name;
    },

    resolveSlot() {
      const match = window.location.pathname.match(/\/office\/(\d+)/);
      return Number(match?.[1] || 1);
    },

    officeTokenKey() {
      return this.officeTournamentId ? `office-token-t${this.officeTournamentId}` : `office-token-${this.slot}`;
    },

    officeNotificationsKey() {
      return this.officeTournamentId ? `office-notifications-t${this.officeTournamentId}` : `office-notifications-${this.slot}`;
    },

    setToken(nextToken) {
      this.token = nextToken || '';
      if (this.token) {
        window.sessionStorage.setItem(this.officeTokenKey(), this.token);
      } else {
        window.sessionStorage.removeItem(this.officeTokenKey());
      }
    },

    showToast(message, type = 'info') {
      this.toast = { show: true, message, type };
      window.setTimeout(() => {
        this.toast.show = false;
      }, 3200);
    },

    logout(message = '') {
      this.stopOfficeSSE();
      this.planningLoadedOnce = false;
      this.drawFormatsLoaded = false;
      this.drawFormats = [];
      this.drawActiveId = null;
      this.drawDraft = null;
      this.drawDraftBase = null;
      this.setToken('');
      this.dashboard = null;
      this.seenMatchKeys = [];
      this.addMatchOpen = false;
      this.editMatchOpen = false;
      this.authError = message;
      this.authPassword = '';
      this.quickInfoDirty = false;
    },

    officeHasUnsavedWork() {
      return this.quickInfoDirty
        || this.quickInfoSaving
        || this.addMatchOpen
        || this.editMatchOpen
        || this.planningSaving
        || !!this.planningSaveTimer
        || this.planningOpenCardId !== null
        || this.categoryEditId !== null
        || this.autoIsPreview?.();
    },

    applyDashboard(nextDashboard, { notify = false } = {}) {
      // Any dashboard applied now (e.g. returned by a save) is newer than requests still in flight.
      this.dashboardSeq = (this.dashboardSeq || 0) + 1;
      const nextMatches = nextDashboard?.matches || [];
      const previousKeys = new Set(this.seenMatchKeys);
      const newMatches = notify ? nextMatches.filter(match => !previousKeys.has(this.matchKey(match))) : [];

      this.dashboard = nextDashboard;
      this.tournamentMeta = nextDashboard?.tournament || this.tournamentMeta;
      if (nextDashboard?.quick_info && !this.quickInfoDirty && !this.quickInfoSaving) {
        this.applyQuickInfo(nextDashboard.quick_info);
      }
      this.ensureDefaultGroupSelection();
      this.rememberSeenMatches(nextMatches);

      if (notify && newMatches.length) {
        this.notifyAboutNewMatches(newMatches);
      }
    },

    matchKey(match) {
      if (!match) return 'unknown';
      return [match.source || 'match', match.id || match.match_id || match.created_at || match.updated_at || 'unknown'].join(':');
    },

    rememberSeenMatches(matches = []) {
      this.seenMatchKeys = matches.map(match => this.matchKey(match));
    },

    async loadMeta() {
      this.metaLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/meta`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.slotMeta'));
        }
        this.tournamentMeta = payload.tournament || null;
      } catch (error) {
        console.error('Failed to load office slot metadata:', error);
        this.authError = error.message || this.ot('errors.slotUnavailable');
      } finally {
        this.metaLoading = false;
      }
    },

    async authenticate() {
      if (!this.authPassword.trim()) {
        this.authError = this.ot('errors.passwordRequired');
        return;
      }

      this.authLoading = true;
      this.authError = '';
      try {
        const response = await fetch(`/api/office/${this.slot}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: this.authPassword }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.authFailed'));
        }
        this.setToken(payload.token || '');
        this.tournamentMeta = payload.tournament || null;
        this.applyDashboard(payload.dashboard || null, { notify: false });
        this.authPassword = '';
        this.authError = '';
        this.connectOfficeSSE();
        this.openOfficePathStart();
        this.showToast(this.ot('toast.unlocked'), 'success');
      } catch (error) {
        console.error('Office auth failed:', error);
        this.authError = error.message || this.ot('errors.wrongPassword');
      } finally {
        this.authLoading = false;
      }
    },

    async loadDashboard(showLoading = true) {
      if (!this.token) return;
      if (showLoading) this.loading = true;
      // A slow, older response must not overwrite a newer dashboard (results just saved).
      this.dashboardSeq = (this.dashboardSeq || 0) + 1;
      const seq = this.dashboardSeq;
      try {
        const response = await fetch(`/api/office/${this.slot}/dashboard`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.refreshFailed'));
        }
        if (seq !== this.dashboardSeq) return;
        this.applyDashboard(payload, { notify: !showLoading });
      } catch (error) {
        console.error('Failed to load office dashboard:', error);
        this.showToast(error.message || this.ot('toast.refreshError'), 'error');
      } finally {
        if (showLoading) this.loading = false;
      }
    },

    officeHeaders() {
      return officeAuthHeaders(this.token);
    },

    formatCompetitorName(value) {
      // players not known yet ("Zwycięzca: Półfinał 1") are phase labels: show them translated
      if (this.officeIsPendingCompetitorName?.(value)) return this.officeDisplayLabel(value);
      return formatTeamLabelForWrap(value);
    },

    officeDisplayLabel(value) {
      return translateStoredScheduleLabel(value, {
        women: this.ot('gender.women'),
        men: this.ot('gender.men'),
        mixed: this.ot('categories.b34Mixed'),
        doubles: this.ot('planning.doubles'),
        semifinal: this.ot('bracket.semifinal'),
        final: this.ot('bracket.final'),
        placeFor: this.ot('bracket.placeFor'),
        quarterfinal: this.ot('bracket.quarterfinal'),
        roundOf: this.ot('bracket.roundOf', { n: '{n}', players: '{players}' }),
        placesRange: this.ot('bracket.placesRange', { from: '{from}', to: '{to}' }),
        consolation: this.ot('bracket.consolation'),
        winnerOf: this.ot('bracket.winnerOf', { match: '{match}' }),
        loserOf: this.ot('bracket.loserOf', { match: '{match}' }),
        group: this.ot('phases.group'),
        groupRematch: this.ot('phases.groupRematch'),
        knockout: this.ot('phases.knockout'),
        groupSuffixLetter: this.ot('planning.groupSuffix', { letter: '{letter}' }),
        winnerSf: this.ot('bracket.winnerSf'),
        loserSf: this.ot('bracket.loserSf'),
      });
    },

    officeProgressPercent() {
      const progress = this.dashboard?.progress;
      if (!progress?.expected_matches) return 0;
      return Math.min(100, Math.round((progress.finished_matches / progress.expected_matches) * 100));
    },
  };
}

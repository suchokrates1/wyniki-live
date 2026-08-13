import { translateStoredScheduleLabel } from '../../shared/labelDisplay.js';
import { formatTeamLabelForWrap } from '../../shared/teamDisplay.js';
import { officeAuthHeaders } from './api.js';
import { defaultOfficeForm, defaultOfficeScheduleForm } from './forms.js';

export function createOfficeCoreView() {
  return {
    slot: 1,

    token: '',

    authPassword: '',

    authError: '',

    metaLoading: false,

    dashboard: null,

    tournamentMeta: null,

    loading: false,

    authLoading: false,

    activeTab: 'history',

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

    planningDragPlayerId: null,

    planningDragTeamId: null,

    planningNewTeam: {
      player1_id: '',
      player2_id: '',
    },

    planningAddTeamOpen: false,

    planningSaving: false,

    planningSaveTimer: null,

    planningStep1Collapsed: false,

    planningOpenCardId: null,

    planningManualOpen: false,

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
      this.token = window.sessionStorage.getItem(this.officeTokenKey()) || '';
      this.hydrateNotificationPreferences();
      this.loadMeta();
      if (this.token) {
        this.loadDashboard();
        this.connectOfficeSSE();
      }
      window.addEventListener('visibilitychange', () => {
        if (!this.isAuthenticated || document.hidden) return;
        this.officeSseFailures = 0;
        this.connectOfficeSSE();
        this.loadDashboard(false);
      });
      window.addEventListener('pagehide', () => this.stopOfficeSSE());
    },

    resolveSlot() {
      const match = window.location.pathname.match(/\/office\/(\d+)/);
      return Number(match?.[1] || 1);
    },

    officeTokenKey() {
      return `office-token-${this.slot}`;
    },

    officeNotificationsKey() {
      return `office-notifications-${this.slot}`;
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
        || this.planningOpenCardId !== null
        || this.categoryEditId !== null
        || this.autoIsPreview?.();
    },

    applyDashboard(nextDashboard, { notify = false } = {}) {
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
      return formatTeamLabelForWrap(value);
    },

    officeDisplayLabel(value) {
      return translateStoredScheduleLabel(value, {
        women: this.ot('gender.women'),
        men: this.ot('gender.men'),
        mixed: this.ot('categories.b34Mixed'),
        semifinal: this.ot('bracket.semifinal'),
        final: this.ot('bracket.final'),
        placeFor: this.ot('bracket.placeFor'),
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

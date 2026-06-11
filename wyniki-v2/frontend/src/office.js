import Alpine from 'alpinejs';
import { createOfficeI18n } from './i18n/officeI18n.js';
import {
  isMixedCategory,
  planningDivisionFromGroupName as sharedPlanningDivisionFromGroupName,
  planningDivisionKey as sharedPlanningDivisionKey,
  planningResolveStoredGroupName as sharedPlanningResolveStoredGroupName,
  planningStoredGroupNames as sharedPlanningStoredGroupNames,
} from './shared/categories.js';
import { translateStoredScheduleLabel } from './shared/labelDisplay.js';
import './main.css';

window.Alpine = Alpine;

function defaultOfficeForm(groupId = '') {
  return {
    mode: 'group',
    group_id: groupId,
    knockout_slot_id: null,
    schedule_id: null,
    court_id: '',
    phase: '',
    player1_name: '',
    player2_name: '',
    walkover: false,
    winner_name: '',
    set1_p1: 4,
    set1_p2: 0,
    set2_p1: 4,
    set2_p2: 0,
    stb_p1: '',
    stb_p2: '',
  };
}

function defaultOfficeScheduleForm() {
  return {
    day_date: '',
    scheduled_time: '',
    court_id: '',
    category_name: '',
    phase: 'Grupowa',
    player1_name: '',
    player2_name: '',
    status: 'planned',
    notes_public: '',
    notes_internal: '',
  };
}

Alpine.data('officeApp', () => ({
  ...createOfficeI18n(),
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
  planningGroups: [],
  planningSchedule: [],
  planningCourts: [],
  planningSelectedDivision: '',
  planningGroupCount: 1,
  planningGroupAssignments: {},
  planningDragPlayerId: null,
  planningSaving: false,
  planningSaveTimer: null,
  planningStep1Collapsed: false,
  planningOpenCardId: null,
  planningManualOpen: false,
  planningPublishing: false,
  planningNewSchedule: defaultOfficeScheduleForm(),
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
    }
    window.setInterval(() => {
      if (this.isAuthenticated) {
        this.loadDashboard(false);
      }
    }, 12000);
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
    this.setToken('');
    this.dashboard = null;
    this.seenMatchKeys = [];
    this.addMatchOpen = false;
    this.editMatchOpen = false;
    this.authError = message;
    this.authPassword = '';
  },

  hydrateNotificationPreferences() {
    const savedValue = window.localStorage.getItem(this.officeNotificationsKey());
    if (savedValue !== null) {
      this.notificationsEnabled = savedValue === 'true';
    }
    if (typeof Notification !== 'undefined') {
      this.notificationPermission = Notification.permission;
    }
  },

  setNotificationsEnabled(nextValue) {
    this.notificationsEnabled = !!nextValue;
    window.localStorage.setItem(this.officeNotificationsKey(), String(this.notificationsEnabled));
  },

  async toggleNotifications() {
    const nextValue = !this.notificationsEnabled;
    this.setNotificationsEnabled(nextValue);
    if (nextValue) {
      await this.ensureNotificationPermission(false);
      this.showToast(this.ot('toast.notificationsOn'), 'success');
      return;
    }
    this.showToast(this.ot('toast.notificationsOff'), 'info');
  },

  matchKey(match) {
    if (!match) return 'unknown';
    return [match.source || 'match', match.id || match.match_id || match.created_at || match.updated_at || 'unknown'].join(':');
  },

  rememberSeenMatches(matches = []) {
    this.seenMatchKeys = matches.map(match => this.matchKey(match));
  },

  applyDashboard(nextDashboard, { notify = false } = {}) {
    const nextMatches = nextDashboard?.matches || [];
    const previousKeys = new Set(this.seenMatchKeys);
    const newMatches = notify ? nextMatches.filter(match => !previousKeys.has(this.matchKey(match))) : [];

    this.dashboard = nextDashboard;
    this.tournamentMeta = nextDashboard?.tournament || this.tournamentMeta;
    this.ensureDefaultGroupSelection();
    this.rememberSeenMatches(nextMatches);

    if (notify && newMatches.length) {
      this.notifyAboutNewMatches(newMatches);
    }
  },

  async ensureNotificationPermission(showWarning = true) {
    if (typeof Notification === 'undefined') {
      this.notificationPermission = 'unsupported';
      if (showWarning) {
        this.showToast(this.ot('toast.notificationsUnsupported'), 'warning');
      }
      return false;
    }

    this.notificationPermission = Notification.permission;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      if (showWarning) {
        this.showToast(this.ot('toast.notificationsBlocked'), 'warning');
      }
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      if (permission !== 'granted' && showWarning) {
        this.showToast(this.ot('toast.notificationsDenied'), 'warning');
      }
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      if (showWarning) {
        this.showToast(this.ot('toast.notificationsFailed'), 'warning');
      }
      return false;
    }
  },

  playNotificationSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      const audioContext = new AudioContextClass();
      const now = audioContext.currentTime;
      const frequencies = [784, 988];

      frequencies.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.14, now + index * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.26);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now + index * 0.16);
        oscillator.stop(now + index * 0.16 + 0.28);
      });

      window.setTimeout(() => {
        audioContext.close().catch(() => {});
      }, 700);
      return true;
    } catch (error) {
      console.error('Failed to play notification sound:', error);
      return false;
    }
  },

  async showBrowserNotification(title, body) {
    if (typeof Notification === 'undefined') {
      this.notificationPermission = 'unsupported';
      return false;
    }

    this.notificationPermission = Notification.permission;
    if (Notification.permission !== 'granted') return false;

    try {
      const notification = new Notification(title, {
        body,
        tag: `office-slot-${this.slot}`,
        renotify: true,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return true;
    } catch (error) {
      console.error('Failed to show browser notification:', error);
      return false;
    }
  },

  async triggerOfficeNotification({ title, body, toastMessage = '' }) {
    const soundPlayed = this.playNotificationSound();
    const browserShown = await this.showBrowserNotification(title, body);

    if (toastMessage) {
      this.showToast(toastMessage, browserShown || soundPlayed ? 'success' : 'info');
      return;
    }

    if (!soundPlayed && !browserShown) {
      this.showToast(body, 'info');
    }
  },

  buildNewMatchNotification(newMatches) {
    const tournamentName = this.tournamentMeta?.name || this.dashboard?.tournament?.name || this.ot('notifications.defaultTitle');
    if (newMatches.length === 1) {
      const match = newMatches[0];
      return {
        title: this.ot('notifications.newResult', { tournament: tournamentName }),
        body: `${match.player1_name || this.ot('notifications.playerA')} ${this.ot('versus')} ${match.player2_name || this.ot('notifications.playerB')}${match.score_text ? `, ${match.score_text}` : ''}`,
      };
    }

    return {
      title: this.ot('notifications.newResults', { tournament: tournamentName, count: newMatches.length }),
      body: newMatches.slice(0, 2).map(match => `${match.player1_name || 'A'} ${this.ot('versus')} ${match.player2_name || 'B'}`).join(' • '),
    };
  },

  async notifyAboutNewMatches(newMatches) {
    if (!this.notificationsEnabled || !newMatches.length) return;
    const notification = this.buildNewMatchNotification(newMatches);
    await this.triggerOfficeNotification({
      ...notification,
      toastMessage: newMatches.length === 1
        ? this.ot('toast.newMatchOne')
        : this.ot('toast.newMatchMany', { count: newMatches.length }),
    });
  },

  async testNotifications() {
    await this.ensureNotificationPermission(false);
    await this.triggerOfficeNotification({
      title: this.ot('notifications.testTitle', {
        tournament: this.tournamentMeta?.name || this.ot('notifications.defaultTitle'),
      }),
      body: this.ot('toast.testBody'),
      toastMessage: this.ot('toast.testStarted'),
    });
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

  ensureDefaultGroupSelection() {
    if (!this.officeNewMatch.group_id && this.officeGroups.length) {
      this.officeNewMatch.group_id = this.officeGroups[0].id;
      this.onOfficeGroupChanged();
    }
  },

  officeProgressPercent() {
    const progress = this.dashboard?.progress;
    if (!progress?.expected_matches) return 0;
    return Math.min(100, Math.round((progress.finished_matches / progress.expected_matches) * 100));
  },

  officeSelectedGroup() {
    const groupId = String(this.officeNewMatch.group_id || '');
    return this.officeGroups.find(group => String(group.id) === groupId) || null;
  },

  officeGroupPlayers(groupId = null) {
    const targetGroupId = String(groupId || this.officeNewMatch.group_id || '');
    const group = this.officeGroups.find(item => String(item.id) === targetGroupId);
    return group?.players || [];
  },

  onOfficeGroupChanged() {
    const players = this.officeGroupPlayers();
    this.officeNewMatch.player1_name = players[0]?.name || '';
    this.officeNewMatch.player2_name = players[1]?.name || '';
    this.officeNewMatch.winner_name = '';
  },

  resetOfficeNewMatch(keepGroup = true) {
    const groupId = keepGroup ? this.officeNewMatch.group_id : '';
    this.officeNewMatch = defaultOfficeForm(groupId);
    if (groupId) {
      this.onOfficeGroupChanged();
    }
  },

  openAddMatchModal() {
    this.ensureDefaultGroupSelection();
    this.officeNewMatch.mode = 'group';
    this.addMatchOpen = true;
  },

  openAddKnockoutResult(slot) {
    this.officeNewMatch = defaultOfficeForm(this.officeNewMatch.group_id);
    this.officeNewMatch.mode = 'knockout';
    this.officeNewMatch.knockout_slot_id = slot.slot_id || slot.id || null;
    this.officeNewMatch.schedule_id = slot.schedule_id || null;
    this.officeNewMatch.court_id = slot.court_id || '';
    this.officeNewMatch.phase = slot.phase || this.ot('phases.knockout');
    this.officeNewMatch.player1_name = slot.player1_name || '';
    this.officeNewMatch.player2_name = slot.player2_name || '';
    this.officeNewMatch.winner_name = '';
    this.addMatchOpen = true;
  },

  closeAddMatchModal() {
    this.addMatchOpen = false;
    this.resetOfficeNewMatch(true);
  },

  officeSetsFromForm(form) {
    const sets = [];
    const addSet = (player1Value, player2Value, isSuperTiebreak = false) => {
      if (player1Value === '' || player2Value === '' || player1Value === null || player2Value === null) return;
      const player1Games = Number(player1Value);
      const player2Games = Number(player2Value);
      if (!Number.isFinite(player1Games) || !Number.isFinite(player2Games)) return;
      sets.push({ player1_games: player1Games, player2_games: player2Games, is_super_tiebreak: isSuperTiebreak });
    };
    addSet(form.set1_p1, form.set1_p2);
    addSet(form.set2_p1, form.set2_p2);
    addSet(form.stb_p1, form.stb_p2, true);
    return sets;
  },

  officeHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  },

  async openPlanningTab() {
    this.activeTab = 'planning';
    if (!this.planningPlayers.length) {
      await this.loadOfficePlanningData();
    }
    if (!this.autoConfig) {
      await this.loadAutoConfig();
    }
  },

  async loadOfficePlanningData() {
    if (!this.token) return;
    this.planningLoading = true;
    try {
      const response = await fetch(`/api/office/${this.slot}/planning`, {
        headers: this.officeHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || this.ot('errors.planningFailed'));
      }
      this.planningPlayers = Array.isArray(payload.players) ? payload.players : [];
      this.planningMixedCategories = Array.isArray(payload.mixed_categories) ? payload.mixed_categories : [];
      this.planningGroups = Array.isArray(payload.groups) ? payload.groups : [];
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
      this.planningCourts = Array.isArray(payload.courts) ? payload.courts : [];
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.syncPlanningGroupAssignments();
      this.ensurePlanningDefaults();
    } catch (error) {
      console.error('Failed to load office planning data:', error);
      this.showToast(error.message || this.ot('toast.planningError'), 'error');
    } finally {
      this.planningLoading = false;
    }
  },

  async loadAutoConfig() {
    if (!this.token) return;
    this.autoLoading = true;
    try {
      const response = await fetch(`/api/office/${this.slot}/autoschedule/config`, {
        headers: this.officeHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) throw new Error(payload.error || this.ot('errors.configFailed'));
      this.autoConfig = payload.config || null;
      this.autoCourts = Array.isArray(payload.courts) ? payload.courts : [];
      this.autoBands = Array.isArray(payload.bands) ? payload.bands : [];
      this.autoStartTime = this.autoConfig?.start_time || '09:30';
      const savedB1Courts = Array.isArray(this.autoConfig?.b1_court_ids)
        ? this.autoConfig.b1_court_ids.map(String).filter(Boolean)
        : [];
      const fallbackB1 = this.autoConfig?.b1_court_id || (this.autoCourts[this.autoCourts.length - 1]?.kort_id || '');
      this.autoB1Courts = savedB1Courts.length ? savedB1Courts : (fallbackB1 ? [String(fallbackB1)] : []);
      this.autoDayDate = this.autoDayDate || this.autoTournamentDates().start || this.autoAvailableDays()[0] || '';
    } catch (error) {
      console.error('Failed to load auto-scheduler config:', error);
      this.showToast(error.message || this.ot('toast.configError'), 'error');
    } finally {
      this.autoLoading = false;
    }
  },

  autoTournamentDates() {
    const source = this.tournamentMeta || this.dashboard?.tournament || {};
    return { start: source.start_date || '', end: source.end_date || '' };
  },

  autoAvailableDays() {
    const days = new Set();
    (this.planningSchedule || []).forEach(entry => {
      if (entry.day_date) days.add(entry.day_date);
    });
    const { start, end } = this.autoTournamentDates();
    if (start) days.add(start);
    if (end && end !== start) days.add(end);
    return Array.from(days).sort();
  },

  autoScopeLabel() {
    if (this.autoPhaseScope === 'knockout') return this.ot('scope.knockout');
    if (this.autoPhaseScope === 'all') return this.ot('scope.all');
    return this.ot('scope.group');
  },

  async autoGenerate() {
    if (!this.token) return;
    this.autoLoading = true;
    try {
      const b1Courts = (this.autoB1Courts || []).map(String).filter(Boolean);
      const body = {
        start_time: this.autoStartTime,
        b1_court_ids: b1Courts,
        b1_court_id: b1Courts[0] || '',
        day_date: this.autoDayDate,
      };
      if (this.autoPhaseScope && this.autoPhaseScope !== 'all') {
        body.phases = [this.autoPhaseScope];
      }
      const response = await fetch(`/api/office/${this.slot}/autoschedule/generate`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || this.ot('errors.proposalFailed'));
      this.autoConfig = payload.config || this.autoConfig;
      this.autoCourts = Array.isArray(payload.courts) ? payload.courts : this.autoCourts;
      this.autoProposal = Array.isArray(payload.placements) ? payload.placements : [];
      const placed = this.autoProposal.filter(p => p.court_id && p.scheduled_time).length;
      if (!placed) {
        const hint = this.autoPhaseScope === 'knockout'
          ? this.ot('toast.hintKnockout')
          : this.ot('toast.hintGroups');
        this.showToast(this.ot('toast.noMatchesScope', { scope: this.autoScopeLabel(), hint }), 'warning');
      } else {
        const placeholders = this.autoProposal.filter(p => p.scheduled_time && this.autoIsPlaceholder(p)).length;
        const extra = placeholders
          ? this.ot('toast.withPlaceholders', { count: placeholders })
          : '';
        this.showToast(this.ot('toast.proposalReady', {
          scope: this.autoScopeLabel(),
          placed,
          extra,
        }), 'success');
      }
    } catch (error) {
      console.error('Auto-generate failed:', error);
      this.showToast(error.message || this.ot('toast.generateError'), 'error');
    } finally {
      this.autoLoading = false;
    }
  },

  autoIsPlaceholder(entry) {
    const isPh = (name) => {
      const value = String(name || '').trim();
      if (!value) return true;
      const lowered = value.toLowerCase();
      if (lowered.startsWith('zwycięzca pf') || lowered.startsWith('przegrany pf')
        || lowered.startsWith('zwycięzca półfinał') || lowered.startsWith('winner sf') || lowered.startsWith('loser sf')) {
        return true;
      }
      if (/^\d+\.\s+/.test(value) || /^\d+[A-Za-z]$/.test(value)) return true;
      return false;
    };
    return isPh(entry?.player1_name) || isPh(entry?.player2_name);
  },

  async autoApply() {
    if (!this.token || !Array.isArray(this.autoProposal)) return;
    const placements = this.autoProposal
      .filter(p => p.schedule_id)
      .map(p => ({
        schedule_id: p.schedule_id,
        court_id: p.court_id,
        day_date: p.day_date,
        scheduled_time: p.scheduled_time,
      }));
    if (!placements.length) {
      this.showToast(this.ot('toast.noPlacements'), 'warning');
      return;
    }
    this.autoLoading = true;
    try {
      const response = await fetch(`/api/office/${this.slot}/autoschedule/apply`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify({ placements }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || this.ot('errors.approveFailed'));
      if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.autoProposal = null;
      this.showToast(this.ot('toast.scheduleApproved'), 'success');
    } catch (error) {
      console.error('Auto-apply failed:', error);
      this.showToast(error.message || this.ot('toast.approveError'), 'error');
    } finally {
      this.autoLoading = false;
    }
  },

  autoDiscardProposal() {
    this.autoProposal = null;
  },

  autoIsPreview() {
    return Array.isArray(this.autoProposal);
  },

  autoB1CourtIds() {
    const saved = Array.isArray(this.autoConfig?.b1_court_ids) ? this.autoConfig.b1_court_ids : [];
    if (saved.length) return saved.map(String);
    if (this.autoB1Courts?.length) return this.autoB1Courts.map(String);
    return this.autoConfig?.b1_court_id ? [String(this.autoConfig.b1_court_id)] : [];
  },

  autoIsB1Court(courtId) {
    return this.autoB1CourtIds().includes(String(courtId));
  },

  autoToggleB1Court(courtId, checked) {
    const value = String(courtId);
    const current = new Set((this.autoB1Courts || []).map(String));
    if (checked) current.add(value);
    else current.delete(value);
    this.autoB1Courts = Array.from(current);
  },

  autoBandForCourt(courtId) {
    if (this.autoIsB1Court(courtId)) return 'B1';
    const map = this.autoConfig?.category_courts || {};
    return Object.keys(map).find(band => String(map[band]) === String(courtId)) || '';
  },

  autoCourtLabel(courtId) {
    const court = (this.autoCourts || []).find(c => String(c.kort_id) === String(courtId));
    const band = this.autoBandForCourt(courtId);
    const name = court
      ? this.ot('planning.courtPrefix', { name: court.name })
      : this.ot('planning.courtPrefix', { name: courtId });
    return band ? `${name} · ${band}${band === 'B1' ? this.ot('planning.specialCourt') : ''}` : name;
  },

  autoSlotMinutes(band, courtId = '') {
    if (courtId && this.autoIsB1Court(courtId)) return 75;
    const slots = this.autoConfig?.slot_minutes || {};
    if (band && slots[band] != null) return Number(slots[band]);
    if (band === 'B1') return 75;
    return Number(slots.default || 60);
  },

  autoAddMinutes(timeStr, minutes) {
    const parts = String(timeStr || '09:30').split(':');
    let total = (Number(parts[0]) || 9) * 60 + (Number(parts[1]) || 30) + Number(minutes || 0);
    total = Math.max(0, Math.min(total, 23 * 60 + 59));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  },

  autoBoardEntries(courtId) {
    const day = this.autoDayDate;
    const sortByTime = (a, b) => String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''));
    if (this.autoIsPreview()) {
      return this.autoProposal
        .filter(p => String(p.court_id) === String(courtId) && p.day_date === day && p.scheduled_time)
        .sort(sortByTime);
    }
    return (this.planningSchedule || [])
      .filter(e => String(e.court_id) === String(courtId) && e.day_date === day && e.scheduled_time)
      .sort(sortByTime);
  },

  autoUnplaced() {
    const day = this.autoDayDate;
    if (this.autoIsPreview()) {
      return this.autoProposal.filter(p => !p.court_id || !p.scheduled_time);
    }
    return (this.planningSchedule || []).filter(
      e => (!e.court_id || !e.scheduled_time) && (!e.day_date || e.day_date === day)
    );
  },

  autoEntryId(entry) {
    return entry?.schedule_id || entry?.id || null;
  },

  autoNextTimeForCourt(courtId) {
    const entries = this.autoBoardEntries(courtId);
    if (!entries.length) return this.autoStartTime;
    const last = entries[entries.length - 1];
    return this.autoAddMinutes(last.scheduled_time, this.autoSlotMinutes(this.autoBandForCourt(courtId)));
  },

  onAutoDragStart(entry, event) {
    this.autoDragId = this.autoEntryId(entry);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', String(this.autoDragId)); } catch (e) { /* noop */ }
    }
  },

  async onAutoDrop(courtId, targetEntry) {
    const scheduleId = this.autoDragId;
    this.autoDragId = null;
    if (!scheduleId) return;
    const dropTime = targetEntry && targetEntry.scheduled_time
      ? targetEntry.scheduled_time
      : this.autoNextTimeForCourt(courtId);
    if (this.autoIsPreview()) {
      this.showToast(this.ot('toast.approveToMove'), 'warning');
      return;
    }
    this.autoLoading = true;
    try {
      const response = await fetch(`/api/office/${this.slot}/autoschedule/move`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify({
          schedule_id: scheduleId,
          court_id: courtId,
          scheduled_time: dropTime,
          day_date: this.autoDayDate,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || this.ot('errors.moveFailed'));
      if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
    } catch (error) {
      console.error('Auto-move failed:', error);
      this.showToast(error.message || this.ot('toast.moveError'), 'error');
    } finally {
      this.autoLoading = false;
    }
  },

  ensurePlanningDefaults() {
    const divisions = this.planningDivisions();
    if (!divisions.find(division => division.key === this.planningSelectedDivision)) {
      this.planningSelectedDivision = divisions[0]?.key || '';
    }
    const selectedGroups = this.planningGroupsForDivision(this.planningSelectedDivision);
    if (selectedGroups.length) {
      this.planningGroupCount = Math.max(1, selectedGroups.length);
    } else {
      this.planningGroupCount = 1;
    }
    this.planningNewSchedule.day_date = this.planningNewSchedule.day_date || this.tournamentMeta?.start_date || this.dashboard?.tournament?.start_date || '';
    this.planningNewSchedule.court_id = this.planningNewSchedule.court_id || this.planningCourts[0]?.kort_id || '';
    const days = this.planningTournamentDays();
    if (!this.autoDayDate || !days.includes(this.autoDayDate)) {
      this.autoDayDate = days[0] || this.autoDayDate || '';
    }
    this.planningStep1Collapsed = this.planningGroupsComplete();
  },

  planningGroupsComplete() {
    const players = this.planningPlayers || [];
    if (!players.length || !(this.planningGroups || []).length) return false;
    return players.every(player => this.planningGroupAssignments[player.id]);
  },

  planningTournamentDays() {
    const { start, end } = this.autoTournamentDates();
    if (start) {
      const startDate = new Date(`${start}T00:00:00`);
      const endDate = end ? new Date(`${end}T00:00:00`) : startDate;
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate >= startDate) {
        const days = [];
        const cursor = new Date(startDate);
        while (cursor <= endDate && days.length < 14) {
          days.push(cursor.toISOString().slice(0, 10));
          cursor.setDate(cursor.getDate() + 1);
        }
        return days;
      }
      return [start];
    }
    const available = this.autoAvailableDays();
    return available.length ? available : [];
  },

  planningDivisionCountLine(division) {
    return `${this.ot('planning.playersCount', { count: division.count })} · ${this.ot('planning.inGroups', { count: this.planningDivisionAssignedCount(division.key) })}`;
  },

  planningStep1CompleteLine() {
    return this.ot('planning.step1Complete', { count: this.planningGroups.length });
  },

  autoSlotMinutesLabel(courtId) {
    return this.ot('planning.slotMinutes', { minutes: this.autoSlotMinutes(this.autoBandForCourt(courtId), courtId) });
  },

  planningUnassignedTitle() {
    return this.ot('planning.unassignedTitle', { count: this.autoUnplaced().length });
  },

  planningDayLabel(day, index) {
    const value = String(day || '');
    const parts = value.split('-');
    const short = parts.length === 3 ? `${parts[2]}.${parts[1]}` : value;
    return this.ot('planning.dayLabel', { number: index + 1, date: short });
  },

  selectPlanningDay(day) {
    this.autoDayDate = day;
    this.planningOpenCardId = null;
    if (this.autoIsPreview()) this.autoDiscardProposal();
  },

  togglePlanningCard(entry) {
    const id = this.autoEntryId(entry);
    this.planningOpenCardId = this.planningOpenCardId === id ? null : id;
  },

  async publishAllSchedule() {
    if (!this.token) return;
    if (!confirm(this.ot('confirm.publishAll'))) return;
    this.planningPublishing = true;
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule/publish`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) throw new Error(payload.error || this.ot('errors.publishFailed'));
      if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      const count = Number(payload.published || 0);
      this.showToast(
        count ? this.ot('toast.publishedCount', { count }) : this.ot('toast.noDraftEntries'),
        count ? 'success' : 'info',
      );
    } catch (error) {
      console.error('Failed to publish schedule:', error);
      this.showToast(error.message || this.ot('toast.publishError'), 'error');
    } finally {
      this.planningPublishing = false;
    }
  },

  syncPlanningGroupAssignments() {
    const assignments = {};
    for (const group of this.planningGroups || []) {
      for (const player of group.players || []) {
        if (player.player_id) assignments[player.player_id] = group.name;
      }
    }
    this.planningGroupAssignments = assignments;
  },

  normalizePlanningCategory(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  },

  normalizePlanningGender(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'K' || raw === 'F' || raw === 'W') return 'K';
    if (raw === 'M') return 'M';
    return '';
  },

  planningDivisionKey(player) {
    return sharedPlanningDivisionKey(
      player?.category || '',
      player?.gender || '',
      this.planningMixedCategories,
    );
  },

  planningDivisionLabel(key = this.planningSelectedDivision) {
    const value = String(key || '').toUpperCase();
    if (isMixedCategory(value, this.planningMixedCategories)) return this.ot('categories.b34Mixed');
    const category = (value.match(/^B\d{1,2}/) || [''])[0];
    const gender = value.endsWith('K')
      ? this.ot('gender.women')
      : value.endsWith('M')
        ? this.ot('gender.men')
        : '';
    if (category && gender) return `${category} ${gender}`;
    return category || gender || this.ot('gender.unassigned');
  },

  planningDivisionFromGroupName(groupName) {
    return sharedPlanningDivisionFromGroupName(groupName, this.planningMixedCategories);
  },

  planningDivisions() {
    const grouped = new Map();
    for (const player of this.planningPlayers || []) {
      const key = this.planningDivisionKey(player);
      if (!grouped.has(key)) grouped.set(key, { key, label: this.planningDivisionLabel(key), count: 0 });
      grouped.get(key).count += 1;
    }
    return [...grouped.values()].sort((left, right) => {
      if (left.key === 'NIEPRZYPISANI') return 1;
      if (right.key === 'NIEPRZYPISANI') return -1;
      return left.key.localeCompare(right.key, 'pl', { numeric: true });
    });
  },

  planningPlayersForDivision(key = this.planningSelectedDivision) {
    return (this.planningPlayers || []).filter(player => this.planningDivisionKey(player) === key);
  },

  planningGroupsForDivision(key = this.planningSelectedDivision) {
    return (this.planningGroups || []).filter(group => this.planningDivisionFromGroupName(group.name) === key);
  },

  planningTargetGroupNames() {
    if (!this.planningSelectedDivision) return [];
    return sharedPlanningStoredGroupNames(
      this.planningSelectedDivision,
      this.planningGroupCount,
      this.planningMixedCategories,
    );
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
      knockout: this.ot('phases.knockout'),
      groupSuffixLetter: this.ot('planning.groupSuffix', { letter: '{letter}' }),
      winnerSf: this.ot('bracket.winnerSf'),
      loserSf: this.ot('bracket.loserSf'),
    });
  },

  planningGroupDisplayName(groupName) {
    return this.officeDisplayLabel(groupName);
  },

  planningResolveGroupName(groupName, divisionKey = this.planningSelectedDivision) {
    const groupCount = divisionKey === this.planningSelectedDivision
      ? this.planningGroupCount
      : this.planningGroupCountForDivision(divisionKey);
    return sharedPlanningResolveStoredGroupName(
      groupName,
      divisionKey,
      groupCount,
      this.planningMixedCategories,
    );
  },

  planningGroupCountForDivision(divisionKey) {
    const groups = (this.planningGroups || []).filter(group => (
      sharedPlanningDivisionFromGroupName(group.name, this.planningMixedCategories) === divisionKey
    ));
    return groups.length ? Math.max(1, Math.min(8, groups.length)) : 1;
  },

  planningDivisionGroupNames() {
    const names = new Set(this.planningTargetGroupNames());
    for (const group of this.planningGroupsForDivision()) names.add(group.name);
    for (const player of this.planningPlayersForDivision()) {
      const assigned = this.planningGroupAssignments[player.id];
      if (assigned) names.add(assigned);
    }
    return [...names];
  },

  planningAssignedPlayers(groupName) {
    return this.planningPlayersForDivision().filter(player => (
      this.planningResolveGroupName(this.planningGroupAssignments[player.id]) === groupName
    ));
  },

  planningEffectiveGroup(player) {
    return this.planningResolveGroupName(this.planningGroupAssignments[player.id]);
  },

  planningUnassignedPlayers() {
    return this.planningPlayersForDivision().filter(player => !this.planningEffectiveGroup(player));
  },

  planningOrdinal(player) {
    return this.planningPlayersForDivision().findIndex(item => item.id === player.id) + 1;
  },

  planningDivisionAssignedCount(key = this.planningSelectedDivision) {
    const targets = new Set(sharedPlanningStoredGroupNames(
      key,
      this.planningGroupCountForDivision(key),
      this.planningMixedCategories,
    ));
    return this.planningPlayersForDivision(key).filter(player => {
      const resolved = this.planningResolveGroupName(this.planningGroupAssignments[player.id], key);
      return resolved && targets.has(resolved);
    }).length;
  },

  selectPlanningDivision(key) {
    this.planningSelectedDivision = key;
    const groups = this.planningGroupsForDivision(key);
    this.planningGroupCount = groups.length ? Math.max(1, Math.min(8, groups.length)) : 1;
  },

  planningSetGroupCount(delta) {
    const next = Math.max(1, Math.min(8, Number(this.planningGroupCount || 1) + Number(delta || 0)));
    if (next === this.planningGroupCount) return;
    this.planningGroupCount = next;
    const valid = new Set(this.planningTargetGroupNames());
    const assignments = { ...this.planningGroupAssignments };
    let changed = false;
    for (const player of this.planningPlayersForDivision()) {
      const assigned = assignments[player.id];
      if (!assigned) continue;
      const canonical = this.planningResolveGroupName(assigned);
      if (!canonical || !valid.has(canonical)) {
        delete assignments[player.id];
        changed = true;
      } else if (canonical !== assigned) {
        assignments[player.id] = canonical;
        changed = true;
      }
    }
    if (changed) this.planningGroupAssignments = assignments;
    this.schedulePlanningAutoSave();
  },

  onPlanningPlayerDragStart(player, event) {
    this.planningDragPlayerId = player.id;
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', String(player.id)); } catch (e) { /* noop */ }
    }
  },

  onPlanningDropToGroup(groupName) {
    const id = this.planningDragPlayerId;
    this.planningDragPlayerId = null;
    if (!id || !groupName) return;
    if (this.planningGroupAssignments[id] === groupName) return;
    this.planningGroupAssignments = { ...this.planningGroupAssignments, [id]: groupName };
    this.schedulePlanningAutoSave();
  },

  onPlanningDropToPool() {
    const id = this.planningDragPlayerId;
    this.planningDragPlayerId = null;
    if (!id || !this.planningGroupAssignments[id]) return;
    const assignments = { ...this.planningGroupAssignments };
    delete assignments[id];
    this.planningGroupAssignments = assignments;
    this.schedulePlanningAutoSave();
  },

  autoAssignPlanningGroups() {
    const groupNames = this.planningTargetGroupNames();
    if (!groupNames.length) return;
    const assignments = { ...this.planningGroupAssignments };
    this.planningPlayersForDivision().forEach((player, index) => {
      assignments[player.id] = groupNames[index % groupNames.length];
    });
    this.planningGroupAssignments = assignments;
    this.schedulePlanningAutoSave();
  },

  clearPlanningDivisionAssignments() {
    const assignments = { ...this.planningGroupAssignments };
    for (const player of this.planningPlayersForDivision()) {
      delete assignments[player.id];
    }
    this.planningGroupAssignments = assignments;
    this.schedulePlanningAutoSave();
  },

  schedulePlanningAutoSave() {
    if (this.planningSaveTimer) clearTimeout(this.planningSaveTimer);
    this.planningSaveTimer = setTimeout(() => { this.autoSavePlanningGroups(); }, 500);
  },

  async autoSavePlanningGroups() {
    if (!this.planningSelectedDivision) return;
    this.planningSaving = true;
    try {
      const otherGroups = (this.planningGroups || [])
        .filter(group => this.planningDivisionFromGroupName(group.name) !== this.planningSelectedDivision)
        .map(group => ({ name: group.name, players: (group.players || []).map(player => player.player_id).filter(Boolean) }));
      const divisionGroups = this.planningTargetGroupNames()
        .map(groupName => ({ name: groupName, players: this.planningAssignedPlayers(groupName).map(player => player.id) }))
        .filter(group => group.players.length > 0);
      const response = await fetch(`/api/office/${this.slot}/planning/groups`, {
        method: 'PUT',
        headers: this.officeHeaders(),
        body: JSON.stringify({ groups: [...otherGroups, ...divisionGroups] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) throw new Error(payload.error || this.ot('errors.groupsFailed'));
      this.planningGroups = Array.isArray(payload.groups) ? payload.groups : this.planningGroups;
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
    } catch (error) {
      console.error('Failed to auto-save office planning groups:', error);
      this.showToast(error.message || this.ot('toast.groupsSaveError'), 'error');
    } finally {
      this.planningSaving = false;
    }
  },

  async savePlanningGroups() {
    if (!this.planningSelectedDivision) return;
    const otherGroups = (this.planningGroups || [])
      .filter(group => this.planningDivisionFromGroupName(group.name) !== this.planningSelectedDivision)
      .map(group => ({ name: group.name, players: (group.players || []).map(player => player.player_id).filter(Boolean) }));
    const divisionGroups = this.planningDivisionGroupNames()
      .map(groupName => ({ name: groupName, players: this.planningAssignedPlayers(groupName).map(player => player.id) }))
      .filter(group => group.players.length > 0);
    if (!divisionGroups.length) {
      this.showToast(this.ot('toast.assignPlayerWarning'), 'warning');
      return;
    }
    try {
      const response = await fetch(`/api/office/${this.slot}/planning/groups`, {
        method: 'PUT',
        headers: this.officeHeaders(),
        body: JSON.stringify({ groups: [...otherGroups, ...divisionGroups] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) throw new Error(payload.error || this.ot('errors.groupsFailed'));
      this.planningGroups = Array.isArray(payload.groups) ? payload.groups : this.planningGroups;
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.syncPlanningGroupAssignments();
      this.showToast(this.ot('toast.groupsSaved'), 'success');
    } catch (error) {
      console.error('Failed to save office planning groups:', error);
      this.showToast(error.message || this.ot('toast.groupsSaveError'), 'error');
    }
  },

  planningPlayerNameOptions() {
    return (this.planningPlayers || [])
      .map(player => player.name || `${player.first_name || ''} ${player.last_name || ''}`.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pl'));
  },

  async generatePlanningSchedule() {
    await this.generateOfficeSchedule();
    await this.loadOfficePlanningData();
  },

  async addPlanningScheduleEntry() {
    if (!this.planningNewSchedule.player1_name || !this.planningNewSchedule.player2_name || this.planningNewSchedule.player1_name === this.planningNewSchedule.player2_name) {
      this.showToast(this.ot('toast.pickTwoPlayers'), 'warning');
      return;
    }
    const selectedCourt = this.planningCourts.find(court => String(court.kort_id || '') === String(this.planningNewSchedule.court_id || ''));
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify({
          ...this.planningNewSchedule,
          court_label: selectedCourt?.name || '',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) throw new Error(payload.error || this.ot('errors.scheduleAddFailed'));
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      const dayDate = this.planningNewSchedule.day_date;
      const courtId = this.planningNewSchedule.court_id;
      const categoryName = this.planningNewSchedule.category_name;
      this.planningNewSchedule = defaultOfficeScheduleForm();
      this.planningNewSchedule.day_date = dayDate;
      this.planningNewSchedule.court_id = courtId;
      this.planningNewSchedule.category_name = categoryName;
      this.showToast(this.ot('toast.scheduleAdded'), 'success');
    } catch (error) {
      console.error('Failed to add office schedule entry:', error);
      this.showToast(error.message || this.ot('toast.scheduleAddError'), 'error');
    }
  },

  async deletePlanningScheduleEntry(entry) {
    if (!entry?.id || !confirm(this.ot('confirm.deleteEntry'))) return;
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule/${entry.id}`, {
        method: 'DELETE',
        headers: this.officeHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) throw new Error(payload.error || this.ot('errors.scheduleDeleteFailed'));
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.showToast(this.ot('toast.scheduleDeleted'), 'success');
    } catch (error) {
      console.error('Failed to delete office schedule entry:', error);
      this.showToast(error.message || this.ot('toast.scheduleDeleteError'), 'error');
    }
  },

  scheduleStatusOptions() {
    return [
      { value: 'draft', label: this.ot('status.draft') },
      { value: 'planned', label: this.ot('status.planned') },
      { value: 'in_progress', label: this.ot('status.inProgress') },
      { value: 'completed', label: this.ot('status.completed') },
    ];
  },

  officeScheduleStatusLabel(status) {
    const found = this.scheduleStatusOptions().find(option => option.value === status);
    return found?.label || status || this.ot('status.draft');
  },

  officeScheduleCourtLabel(entry) {
    return entry?.court_label || entry?.court_id || this.ot('dates.courtTbd');
  },

  officeScheduleHasResult(entry) {
    return !!(entry?.has_result || entry?.score_text || (entry?.status === 'completed' && entry?.winner_name));
  },

  officeScheduleResultLabel(entry) {
    if (!entry) return '';
    if (entry.result_note) return entry.result_note;
    if (entry.score_text) return entry.score_text;
    if (entry.winner_name) return this.ot('status.completed');
    return '';
  },

  formatOfficeScheduleDay(entry) {
    const rawValue = entry?.day_date || '';
    if (!rawValue) return this.ot('dates.noDate');
    const parsedDate = new Date(`${rawValue}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return rawValue;
    return new Intl.DateTimeFormat(this.officeLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }).format(parsedDate);
  },

  async generateOfficeSchedule() {
    const { start, end } = this.autoTournamentDates();
    const dayDate = this.autoDayDate || (end && end !== start ? end : start) || '';
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule/generate`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify(dayDate ? { day_date: dayDate } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || this.ot('errors.scheduleGenerateFailed'));
      }
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.showToast(this.ot('toast.scheduleRefreshed'), 'success');
    } catch (error) {
      console.error('Failed to generate schedule:', error);
      this.showToast(error.message || this.ot('toast.scheduleError'), 'error');
    }
  },

  async saveOfficeScheduleEntry(entry) {
    if (!entry?.id) return;
    const selectedCourt = [...this.officeCourts, ...this.planningCourts].find(court => String(court.kort_id || '') === String(entry.court_id || ''));
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule/${entry.id}`, {
        method: 'PATCH',
        headers: this.officeHeaders(),
        body: JSON.stringify({
          day_date: entry.day_date,
          scheduled_time: entry.scheduled_time,
          court_id: entry.court_id,
          court_label: selectedCourt?.name || entry.court_label || '',
          status: entry.status,
          notes_public: entry.notes_public,
          notes_internal: entry.notes_internal,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || this.ot('errors.scheduleEntryFailed'));
      }
      if (payload.schedule) this.planningSchedule = payload.schedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.showToast(this.ot('toast.scheduleSaved'), 'success');
    } catch (error) {
      console.error('Failed to save schedule entry:', error);
      this.showToast(error.message || this.ot('toast.scheduleSaveError'), 'error');
    }
  },

  async addOfficeGroupMatch() {
    if (!this.officeNewMatch.group_id || !this.officeNewMatch.player1_name || !this.officeNewMatch.player2_name) {
      this.showToast(this.ot('toast.pickGroupPlayers'), 'warning');
      return;
    }
    if (this.officeNewMatch.player1_name === this.officeNewMatch.player2_name) {
      this.showToast(this.ot('toast.pickTwoPlayers'), 'warning');
      return;
    }
    if (this.officeNewMatch.walkover && !this.officeNewMatch.winner_name) {
      this.showToast(this.ot('toast.walkoverWinnerRequired'), 'warning');
      return;
    }

    try {
      const response = await fetch(`/api/office/${this.slot}/group-matches`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify({
          group_id: this.officeNewMatch.group_id,
          player1_name: this.officeNewMatch.player1_name,
          player2_name: this.officeNewMatch.player2_name,
          walkover: this.officeNewMatch.walkover,
          winner_name: this.officeNewMatch.winner_name,
          sets: this.officeSetsFromForm(this.officeNewMatch),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || this.ot('errors.resultFailed'));
      }
      this.applyDashboard(payload.dashboard, { notify: false });
      this.closeAddMatchModal();
      const generated = payload.knockout_generation?.status === 'ok' ? this.ot('toast.knockoutGenerated') : '';
      this.showToast(`${this.ot('toast.resultSaved')}${generated}`, 'success');
    } catch (error) {
      console.error('Failed to add office result:', error);
      this.showToast(error.message || this.ot('toast.addResultError'), 'error');
    }
  },

  async addOfficeKnockoutMatch() {
    if (!this.officeNewMatch.schedule_id && !this.officeNewMatch.knockout_slot_id) {
      this.showToast(this.ot('toast.pickKnockoutMatch'), 'warning');
      return;
    }
    if (!this.officeNewMatch.player1_name || !this.officeNewMatch.player2_name) {
      this.showToast(this.ot('toast.knockoutSlotIncomplete'), 'warning');
      return;
    }
    if (this.officeNewMatch.walkover && !this.officeNewMatch.winner_name) {
      this.showToast(this.ot('toast.walkoverWinnerRequired'), 'warning');
      return;
    }

    try {
      const response = await fetch(`/api/office/${this.slot}/knockout-matches`, {
        method: 'POST',
        headers: this.officeHeaders(),
        body: JSON.stringify({
          schedule_id: this.officeNewMatch.schedule_id,
          knockout_slot_id: this.officeNewMatch.knockout_slot_id,
          court_id: this.officeNewMatch.court_id,
          player1_name: this.officeNewMatch.player1_name,
          player2_name: this.officeNewMatch.player2_name,
          walkover: this.officeNewMatch.walkover,
          winner_name: this.officeNewMatch.winner_name,
          sets: this.officeSetsFromForm(this.officeNewMatch),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || this.ot('errors.knockoutFailed'));
      }
      this.applyDashboard(payload.dashboard, { notify: false });
      this.closeAddMatchModal();
      this.showToast(this.ot('toast.knockoutResultSaved'), 'success');
    } catch (error) {
      console.error('Failed to add office knockout result:', error);
      this.showToast(error.message || this.ot('toast.knockoutResultError'), 'error');
    }
  },

  async addOfficeMatchResult() {
    if (this.officeNewMatch.mode === 'knockout') {
      await this.addOfficeKnockoutMatch();
      return;
    }
    await this.addOfficeGroupMatch();
  },

  officeKnockoutStatusLabel(slot) {
    if (slot?.winner_name) return this.ot('status.knockoutFinished');
    if (slot?.status === 'in_progress') return this.ot('status.inProgress');
    if (slot?.status === 'planned') return this.ot('status.knockoutPlanned');
    if (slot?.ready) return this.ot('status.knockoutReady');
    return this.ot('status.knockoutWaiting');
  },

  officeKnockoutCanAddResult(slot) {
    return !!slot?.ready && !slot?.winner_name && (!!slot?.schedule_id || !!slot?.slot_id);
  },

  officeMatchById(matchId) {
    const targetId = Number(matchId || 0);
    if (!targetId) return null;
    return this.officeMatches.find(match => Number(match.match_id || match.id || 0) === targetId) || null;
  },

  startOfficeEditFromKnockout(slot) {
    const match = this.officeMatchById(slot?.match_id);
    if (!match) {
      this.showToast(this.ot('toast.noHistoryEntry'), 'warning');
      return;
    }
    this.startOfficeEdit(match);
  },

  startOfficeEdit(match) {
    const sets = match.sets_history || [];
    this.officeEditingMatch = {
      id: match.id,
      source: match.source || 'match',
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      walkover: false,
      winner_name: match.winner_name || '',
      set1_p1: sets[0]?.player1_games ?? '',
      set1_p2: sets[0]?.player2_games ?? '',
      set2_p1: sets[1]?.player1_games ?? '',
      set2_p2: sets[1]?.player2_games ?? '',
      stb_p1: sets[2]?.player1_games ?? '',
      stb_p2: sets[2]?.player2_games ?? '',
    };
    this.editMatchOpen = true;
  },

  closeEditModal() {
    this.officeEditingMatch = null;
    this.editMatchOpen = false;
  },

  async saveOfficeMatchEdit() {
    if (!this.officeEditingMatch?.id) return;
    if (this.officeEditingMatch.walkover && !this.officeEditingMatch.winner_name) {
      this.showToast(this.ot('toast.walkoverWinnerRequired'), 'warning');
      return;
    }

    try {
      const response = await fetch(`/api/office/${this.slot}/matches/${this.officeEditingMatch.id}`, {
        method: 'PUT',
        headers: this.officeHeaders(),
        body: JSON.stringify({
          source: this.officeEditingMatch.source || 'match',
          walkover: this.officeEditingMatch.walkover,
          winner_name: this.officeEditingMatch.winner_name,
          sets: this.officeSetsFromForm(this.officeEditingMatch),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout(this.ot('errors.sessionExpired'));
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || this.ot('errors.correctionFailed'));
      }
      this.applyDashboard(payload.dashboard, { notify: false });
      this.closeEditModal();
      this.showToast(this.ot('toast.resultCorrected'), 'success');
    } catch (error) {
      console.error('Failed to update office result:', error);
      this.showToast(error.message || this.ot('toast.correctionError'), 'error');
    }
  },

  officeMatchPhase(match) {
    if (match.group_name) return this.officeDisplayLabel(match.group_name);
    return this.officeDisplayLabel(match.phase) || this.ot('phases.match');
  },

  officePhaseTone(match) {
    if (match.group_name) return 'office-chip-group';
    if ((match.phase || '') && (match.phase || '').toLowerCase() !== 'grupowa') return 'office-chip-knockout';
    return 'office-chip-neutral';
  },

  groupCompletionLabel(group) {
    if (!group) return this.ot('status.noData');
    if (group.complete) return this.ot('status.complete');
    return `${group.finished_matches}/${group.expected_matches}`;
  },

  formatOfficeMatchTime(match) {
    const rawValue = match?.updated_at || match?.created_at || '';
    if (!rawValue) return '—';
    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) return rawValue;
    return new Intl.DateTimeFormat(this.officeLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsedDate);
  },

  officeMatchWinner(match) {
    if (!match) return null;
    if (match.winner_name) {
      if (match.winner_name === match.player1_name) return 'A';
      if (match.winner_name === match.player2_name) return 'B';
    }
    const player1Sets = Number(match.player1_sets || 0);
    const player2Sets = Number(match.player2_sets || 0);
    if (player1Sets > player2Sets) return 'A';
    if (player2Sets > player1Sets) return 'B';
    return null;
  },

  officeMatchSets(match) {
    if (!Array.isArray(match?.sets_history)) return [];
    const sets = [];
    for (const setInfo of match.sets_history) {
      let a = Number(setInfo?.player1_games ?? 0);
      let b = Number(setInfo?.player2_games ?? 0);
      const tb = setInfo?.tiebreak_loser_points ?? null;
      const isSuperTB = !!setInfo?.is_super_tiebreak;
      if (isSuperTB && tb !== null && tb !== undefined) {
        const winnerPts = Math.max(10, Number(tb) + 2);
        if (a > b) {
          a = winnerPts;
          b = Number(tb);
        } else {
          a = Number(tb);
          b = winnerPts;
        }
      }
      sets.push({ a, b, tb: isSuperTB ? null : tb, isSuperTB });
    }
    return sets;
  },

  officeMatchScore(match) {
    return match.score_text || `${match.player1_sets || 0}:${match.player2_sets || 0}`;
  },
}));

Alpine.start();
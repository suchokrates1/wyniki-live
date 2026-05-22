import Alpine from 'alpinejs';
import './main.css';

window.Alpine = Alpine;

function defaultOfficeForm(groupId = '') {
  return {
    group_id: groupId,
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
  planningGroups: [],
  planningSchedule: [],
  planningCourts: [],
  planningSelectedDivision: '',
  planningGroupCount: 1,
  planningGroupAssignments: {},
  planningScheduleFilter: { day: '', category: '', court: '' },
  planningNewSchedule: defaultOfficeScheduleForm(),
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

  get officeSchedule() {
    return this.dashboard?.schedule || [];
  },

  get officeCourts() {
    return this.dashboard?.courts || [];
  },

  init() {
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
      this.showToast('Powiadomienia o nowych meczach włączone', 'success');
      return;
    }
    this.showToast('Powiadomienia o nowych meczach wyłączone', 'info');
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
        this.showToast('Ta przeglądarka nie obsługuje powiadomień systemowych.', 'warning');
      }
      return false;
    }

    this.notificationPermission = Notification.permission;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      if (showWarning) {
        this.showToast('Powiadomienia systemowe są zablokowane w przeglądarce.', 'warning');
      }
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      if (permission !== 'granted' && showWarning) {
        this.showToast('Nie przyznano zgody na powiadomienia systemowe.', 'warning');
      }
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      if (showWarning) {
        this.showToast('Nie udało się uzyskać zgody na powiadomienia.', 'warning');
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
    const tournamentName = this.tournamentMeta?.name || this.dashboard?.tournament?.name || 'Biuro turnieju';
    if (newMatches.length === 1) {
      const match = newMatches[0];
      return {
        title: `${tournamentName}: nowy wynik`,
        body: `${match.player1_name || 'Zawodnik A'} vs ${match.player2_name || 'Zawodnik B'}${match.score_text ? `, ${match.score_text}` : ''}`,
      };
    }

    return {
      title: `${tournamentName}: ${newMatches.length} nowych wyników`,
      body: newMatches.slice(0, 2).map(match => `${match.player1_name || 'A'} vs ${match.player2_name || 'B'}`).join(' • '),
    };
  },

  async notifyAboutNewMatches(newMatches) {
    if (!this.notificationsEnabled || !newMatches.length) return;
    const notification = this.buildNewMatchNotification(newMatches);
    await this.triggerOfficeNotification({
      ...notification,
      toastMessage: newMatches.length === 1 ? 'Wpadł nowy zakończony mecz.' : `Wpadły ${newMatches.length} nowe zakończone mecze.`,
    });
  },

  async testNotifications() {
    await this.ensureNotificationPermission(false);
    await this.triggerOfficeNotification({
      title: `${this.tournamentMeta?.name || 'Biuro turnieju'}: test powiadomienia`,
      body: 'To jest test dźwięku i powiadomienia o nowym zakończonym meczu.',
      toastMessage: 'Test powiadomienia został uruchomiony.',
    });
  },

  async loadMeta() {
    this.metaLoading = true;
    try {
      const response = await fetch(`/api/office/${this.slot}/meta`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się odczytać informacji o slocie biura.');
      }
      this.tournamentMeta = payload.tournament || null;
    } catch (error) {
      console.error('Failed to load office slot metadata:', error);
      this.authError = error.message || 'Slot biura nie jest dostępny.';
    } finally {
      this.metaLoading = false;
    }
  },

  async authenticate() {
    if (!this.authPassword.trim()) {
      this.authError = 'Podaj hasło biura.';
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
        throw new Error(payload.error || 'Nie udało się zalogować do biura.');
      }
      this.setToken(payload.token || '');
      this.tournamentMeta = payload.tournament || null;
      this.applyDashboard(payload.dashboard || null, { notify: false });
      this.authPassword = '';
      this.authError = '';
      this.showToast('Biuro turnieju odblokowane', 'success');
    } catch (error) {
      console.error('Office auth failed:', error);
      this.authError = error.message || 'Błędne hasło biura.';
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się odświeżyć biura.');
      }
      this.applyDashboard(payload, { notify: !showLoading });
    } catch (error) {
      console.error('Failed to load office dashboard:', error);
      this.showToast(error.message || 'Błąd odświeżania biura', 'error');
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się załadować planu turnieju.');
      }
      this.planningPlayers = Array.isArray(payload.players) ? payload.players : [];
      this.planningGroups = Array.isArray(payload.groups) ? payload.groups : [];
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
      this.planningCourts = Array.isArray(payload.courts) ? payload.courts : [];
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.syncPlanningGroupAssignments();
      this.ensurePlanningDefaults();
    } catch (error) {
      console.error('Failed to load office planning data:', error);
      this.showToast(error.message || 'Błąd ładowania planu turnieju', 'error');
    } finally {
      this.planningLoading = false;
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
    const category = this.normalizePlanningCategory(player?.category || '');
    const gender = this.normalizePlanningGender(player?.gender || '');
    return category && gender ? `${category}${gender}` : category || gender || 'NIEPRZYPISANI';
  },

  planningDivisionLabel(key = this.planningSelectedDivision) {
    const value = String(key || '').toUpperCase();
    const category = (value.match(/^B\d{1,2}/) || [''])[0];
    const gender = value.endsWith('K') ? 'Kobiety' : value.endsWith('M') ? 'Mężczyźni' : '';
    if (category && gender) return `${category} ${gender}`;
    return category || gender || 'Nieprzypisani';
  },

  planningDivisionFromGroupName(groupName) {
    const label = String(groupName || '').split(' — ')[0].split(' - ')[0].trim();
    const category = (label.toUpperCase().match(/^B\d{1,2}/) || [''])[0];
    const lower = label.toLowerCase();
    let gender = '';
    if (lower.includes('kob') || label.toUpperCase().endsWith('K')) gender = 'K';
    if (lower.includes('męż') || lower.includes('mez') || lower.includes('mężczy') || label.toUpperCase().endsWith('M')) gender = 'M';
    return category && gender ? `${category}${gender}` : category || gender || '';
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
    const count = Math.max(1, Math.min(8, Number(this.planningGroupCount || 1)));
    const label = this.planningDivisionLabel();
    if (!this.planningSelectedDivision) return [];
    if (count === 1) return [label];
    return Array.from({ length: count }, (_, index) => `${label} — Grupa ${String.fromCharCode(65 + index)}`);
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
    return this.planningPlayersForDivision().filter(player => this.planningGroupAssignments[player.id] === groupName);
  },

  planningUnassignedPlayers() {
    return this.planningPlayersForDivision().filter(player => !this.planningGroupAssignments[player.id]);
  },

  autoAssignPlanningGroups() {
    const groupNames = this.planningTargetGroupNames();
    if (!groupNames.length) return;
    this.planningPlayersForDivision().forEach((player, index) => {
      this.planningGroupAssignments[player.id] = groupNames[index % groupNames.length];
    });
  },

  clearPlanningDivisionAssignments() {
    for (const player of this.planningPlayersForDivision()) {
      delete this.planningGroupAssignments[player.id];
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
      this.showToast('Przypisz przynajmniej jednego zawodnika do grupy', 'warning');
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Nie udało się zapisać grup.');
      this.planningGroups = Array.isArray(payload.groups) ? payload.groups : this.planningGroups;
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.syncPlanningGroupAssignments();
      this.showToast('Grupy zapisane', 'success');
    } catch (error) {
      console.error('Failed to save office planning groups:', error);
      this.showToast(error.message || 'Błąd zapisu grup', 'error');
    }
  },

  planningScheduleDays() {
    return [...new Set((this.planningSchedule || []).map(entry => entry.day_date).filter(Boolean))];
  },

  planningScheduleCategories() {
    return [...new Set((this.planningSchedule || []).map(entry => entry.category_name || entry.group_name || entry.phase).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  },

  planningScheduleEntries() {
    return (this.planningSchedule || []).filter(entry => {
      if (this.planningScheduleFilter.day && entry.day_date !== this.planningScheduleFilter.day) return false;
      if (this.planningScheduleFilter.court && entry.court_id !== this.planningScheduleFilter.court) return false;
      if (this.planningScheduleFilter.category) {
        const category = entry.category_name || entry.group_name || entry.phase || '';
        if (category !== this.planningScheduleFilter.category) return false;
      }
      return true;
    });
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
      this.showToast('Wybierz dwóch różnych zawodników', 'warning');
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Nie udało się dodać wpisu terminarza.');
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      const dayDate = this.planningNewSchedule.day_date;
      const courtId = this.planningNewSchedule.court_id;
      const categoryName = this.planningNewSchedule.category_name;
      this.planningNewSchedule = defaultOfficeScheduleForm();
      this.planningNewSchedule.day_date = dayDate;
      this.planningNewSchedule.court_id = courtId;
      this.planningNewSchedule.category_name = categoryName;
      this.showToast('Dodano wpis terminarza', 'success');
    } catch (error) {
      console.error('Failed to add office schedule entry:', error);
      this.showToast(error.message || 'Błąd dodawania wpisu', 'error');
    }
  },

  async deletePlanningScheduleEntry(entry) {
    if (!entry?.id || !confirm('Usunąć ten wpis terminarza?')) return;
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule/${entry.id}`, {
        method: 'DELETE',
        headers: this.officeHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Nie udało się usunąć wpisu terminarza.');
      this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.showToast('Wpis usunięty', 'success');
    } catch (error) {
      console.error('Failed to delete office schedule entry:', error);
      this.showToast(error.message || 'Błąd usuwania wpisu', 'error');
    }
  },

  scheduleStatusOptions() {
    return [
      { value: 'draft', label: 'Roboczy' },
      { value: 'planned', label: 'Opublikowany' },
      { value: 'in_progress', label: 'W trakcie' },
      { value: 'completed', label: 'Zakończony' },
    ];
  },

  officeScheduleStatusLabel(status) {
    const found = this.scheduleStatusOptions().find(option => option.value === status);
    return found?.label || status || 'Roboczy';
  },

  officeScheduleCourtLabel(entry) {
    return entry?.court_label || entry?.court_id || 'Kort do ustalenia';
  },

  formatOfficeScheduleDay(entry) {
    const rawValue = entry?.day_date || '';
    if (!rawValue) return 'Bez daty';
    const parsedDate = new Date(`${rawValue}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return rawValue;
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(parsedDate);
  },

  async generateOfficeSchedule() {
    try {
      const response = await fetch(`/api/office/${this.slot}/schedule/generate`, {
        method: 'POST',
        headers: this.officeHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się utworzyć terminarza.');
      }
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.showToast('Terminarz odświeżony', 'success');
    } catch (error) {
      console.error('Failed to generate schedule:', error);
      this.showToast(error.message || 'Błąd terminarza', 'error');
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się zapisać wpisu terminarza.');
      }
      if (payload.schedule) this.planningSchedule = payload.schedule;
      if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
      this.showToast('Wpis terminarza zapisany', 'success');
    } catch (error) {
      console.error('Failed to save schedule entry:', error);
      this.showToast(error.message || 'Błąd zapisu terminarza', 'error');
    }
  },

  async addOfficeGroupMatch() {
    if (!this.officeNewMatch.group_id || !this.officeNewMatch.player1_name || !this.officeNewMatch.player2_name) {
      this.showToast('Wybierz grupę i zawodników', 'warning');
      return;
    }
    if (this.officeNewMatch.player1_name === this.officeNewMatch.player2_name) {
      this.showToast('Wybierz dwóch różnych zawodników', 'warning');
      return;
    }
    if (this.officeNewMatch.walkover && !this.officeNewMatch.winner_name) {
      this.showToast('Przy walkowerze wskaż zwycięzcę', 'warning');
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się dodać wyniku.');
      }
      this.applyDashboard(payload.dashboard, { notify: false });
      this.closeAddMatchModal();
      const generated = payload.knockout_generation?.status === 'ok' ? ' Drabinka została wygenerowana.' : '';
      this.showToast(`Wynik zapisany.${generated}`, 'success');
    } catch (error) {
      console.error('Failed to add office result:', error);
      this.showToast(error.message || 'Błąd dodawania wyniku', 'error');
    }
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
      this.showToast('Przy walkowerze wskaż zwycięzcę', 'warning');
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
        this.logout('Sesja biura wygasła. Zaloguj się ponownie.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nie udało się poprawić wyniku.');
      }
      this.applyDashboard(payload.dashboard, { notify: false });
      this.closeEditModal();
      this.showToast('Wynik poprawiony', 'success');
    } catch (error) {
      console.error('Failed to update office result:', error);
      this.showToast(error.message || 'Błąd korekty wyniku', 'error');
    }
  },

  officeMatchPhase(match) {
    if (match.group_name) return match.group_name;
    return match.phase || 'Mecz';
  },

  officePhaseTone(match) {
    if (match.group_name) return 'office-chip-group';
    if ((match.phase || '').toLowerCase() === 'pucharowa') return 'office-chip-knockout';
    return 'office-chip-neutral';
  },

  groupCompletionLabel(group) {
    if (!group) return 'Brak danych';
    if (group.complete) return 'Komplet';
    return `${group.finished_matches}/${group.expected_matches}`;
  },

  formatOfficeMatchTime(match) {
    const rawValue = match?.updated_at || match?.created_at || '';
    if (!rawValue) return '—';
    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) return rawValue;
    return new Intl.DateTimeFormat('pl-PL', {
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
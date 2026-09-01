import Alpine from 'alpinejs';
import { createUmpireApi } from './api.js';
import { umpireText } from './i18n.js';
import { buildMatchConfig, DEFAULT_MATCH_CONFIG_FORM, startDraft } from './matchConfigForm.js';
import { createPinPad } from './pinPad.js';
import {
  AVAILABLE_LANGUAGES,
  createUmpireSession,
  firstScreen,
  parseExpiresAt,
} from './session.js';
import { StatsMode } from './match-engine/models.js';
import './umpire.css';

const session = createUmpireSession();

function playerId(player) {
  return player?.id;
}

function playerLabel(player) {
  if (!player) return '';
  const full = `${player.first_name || player.firstName || ''} ${player.last_name || player.lastName || player.surname || ''}`.trim();
  return full || player.name || player.full_name || '';
}

function neededCount(isDoubles) {
  return isDoubles ? 4 : 2;
}

function createUmpireApp() {
  const pinPad = createPinPad();
  const api = createUmpireApi({
    getToken: () => session.getCourtSession()?.token || null,
  });

  return {
    languages: AVAILABLE_LANGUAGES,
    screen: firstScreen({ hasLanguage: session.hasLanguageSelected() }),
    lang: session.hasLanguageSelected() ? session.getLanguage() : 'en',
    loading: false,
    error: '',
    tournaments: [],
    courts: [],
    players: [],
    suggestion: null,
    selectedIds: [],
    isDoubles: false,
    search: '',
    showAddPlayer: false,
    addForm: { firstName: '', lastName: '', country: '' },
    pinOpen: false,
    pinCourt: null,
    pinBusy: false,
    pinError: '',
    pinBoxes: ['', '', '', ''],
    configForm: { ...DEFAULT_MATCH_CONFIG_FORM },
    draft: null,
    settingsFrom: 'court',

    t(key, vars) {
      return umpireText(this.lang, key, vars);
    },

    init() {
      this.go(this.screen, { replace: true });
      window.addEventListener('hashchange', () => this.syncFromHash());
    },

    syncFromHash() {
      const name = (location.hash.replace(/^#\/?/, '') || this.screen).split('/')[0];
      if (name && name !== this.screen) {
        this.screen = name;
        this.onScreen(name);
      }
    },

    go(name, { replace = false } = {}) {
      this.screen = name;
      this.error = '';
      const hash = `#/${name}`;
      if (replace) history.replaceState(null, '', hash);
      else location.hash = hash;
      this.onScreen(name);
    },

    onScreen(name) {
      if (name === 'tournament') this.loadTournaments();
      if (name === 'court') this.loadCourts();
      if (name === 'players') this.loadPlayers();
      if (name === 'serve') this.draft = session.getDraft();
    },

    selectLanguage(code) {
      session.setLanguage(code);
      this.lang = code;
      this.go('tournament');
    },

    async loadTournaments() {
      this.loading = true;
      const { ok, data } = await api.getActiveTournaments();
      this.loading = false;
      if (!ok) {
        this.error = this.t('error');
        this.tournaments = [];
        return;
      }
      this.tournaments = Array.isArray(data) ? data : (data?.tournaments || []);
    },

    selectTournament(tournament) {
      session.saveTournament(tournament);
      this.go('court');
    },

    async loadCourts() {
      const tournament = session.getTournamentForToday();
      if (!tournament) {
        this.go('tournament');
        return;
      }
      this.loading = true;
      const { ok, data } = await api.getCourts(tournament.id);
      this.loading = false;
      if (!ok) {
        this.error = this.t('error');
        this.courts = [];
        return;
      }
      this.courts = data?.courts || [];
    },

    openPin(court) {
      this.pinCourt = court;
      this.pinError = '';
      this.pinBusy = false;
      pinPad.clear();
      this.pinBoxes = pinPad.boxes();
      this.pinOpen = true;
    },

    closePin() {
      this.pinOpen = false;
      this.pinCourt = null;
      pinPad.clear();
      this.pinBoxes = pinPad.boxes();
    },

    async enterPinDigit(digit) {
      if (this.pinBusy) return;
      pinPad.append(digit);
      this.pinBoxes = pinPad.boxes();
      if (pinPad.complete) await this.submitPin();
    },

    pinBackspace() {
      if (this.pinBusy) return;
      pinPad.backspace();
      this.pinBoxes = pinPad.boxes();
    },

    async submitPin() {
      if (!this.pinCourt || !pinPad.complete || this.pinBusy) return;
      this.pinBusy = true;
      this.pinError = '';
      const { ok, data } = await api.authorizeCourt(this.pinCourt.kort_id || this.pinCourt.id, pinPad.value);
      this.pinBusy = false;
      if (!ok || !data?.authorized) {
        pinPad.clear();
        this.pinBoxes = pinPad.boxes();
        this.pinError = this.t('pinInvalid');
        return;
      }
      session.saveCourtSession({
        courtId: data.court_id || data.kort_id || this.pinCourt.kort_id,
        courtName: this.pinCourt.name,
        token: data.token,
        expiresAtMillis: parseExpiresAt(data.expires_at),
      });
      this.closePin();
      this.go('players');
    },

    async loadPlayers() {
      const court = session.getCourtSession();
      if (!court?.courtId) {
        this.go('court');
        return;
      }
      const tournament = session.getTournamentForToday();
      this.loading = true;
      const [playersRes, suggestionRes] = await Promise.all([
        api.getPlayers(court.courtId),
        api.getSuggestedMatch(court.courtId, tournament?.id),
      ]);
      this.loading = false;
      if (!playersRes.ok) {
        this.error = this.t('error');
        this.players = [];
        return;
      }
      this.players = playersRes.data?.players || [];
      this.suggestion = suggestionRes.ok ? suggestionRes.data?.suggestion : null;
    },

    filteredPlayers() {
      const query = this.search.trim().toLowerCase();
      if (!query) return this.players;
      return this.players.filter((player) => playerLabel(player).toLowerCase().includes(query));
    },

    isSelected(player) {
      return this.selectedIds.includes(playerId(player));
    },

    selectionIndex(player) {
      return this.selectedIds.indexOf(playerId(player));
    },

    togglePlayer(player) {
      const id = playerId(player);
      const index = this.selectedIds.indexOf(id);
      if (index >= 0) {
        this.selectedIds = this.selectedIds.filter((item) => item !== id);
        return;
      }
      if (this.selectedIds.length >= neededCount(this.isDoubles)) return;
      this.selectedIds = [...this.selectedIds, id];
    },

    selectedPlayers() {
      return this.selectedIds
        .map((id) => this.players.find((player) => playerId(player) === id))
        .filter(Boolean);
    },

    canContinuePlayers() {
      return this.selectedPlayers().length === neededCount(this.isDoubles);
    },

    applySuggestion() {
      const suggestion = this.suggestion;
      if (!suggestion) return;
      this.isDoubles = Boolean(suggestion.is_doubles);
      const ids = [];
      const pushPerson = (person) => {
        if (!person?.id) return;
        ids.push(person.id);
        if (person.partner?.id) ids.push(person.partner.id);
      };
      pushPerson(suggestion.player1);
      pushPerson(suggestion.player2);
      this.selectedIds = ids.slice(0, neededCount(this.isDoubles));
    },

    async saveNewPlayer() {
      const court = session.getCourtSession();
      const lastName = this.addForm.lastName.trim();
      if (!court?.courtId || !lastName) return;
      this.loading = true;
      const { ok, data } = await api.addPlayer({
        kort_id: court.courtId,
        first_name: this.addForm.firstName.trim(),
        last_name: lastName,
        country: this.addForm.country.trim().toUpperCase() || undefined,
      });
      this.loading = false;
      if (!ok) {
        this.error = this.t('error');
        return;
      }
      this.showAddPlayer = false;
      this.addForm = { firstName: '', lastName: '', country: '' };
      await this.loadPlayers();
      const created = data?.player || data;
      if (created?.id) this.togglePlayer(created);
    },

    openConfig() {
      if (!this.canContinuePlayers()) return;
      this.configForm = { ...DEFAULT_MATCH_CONFIG_FORM };
      this.go('config');
    },

    startWithMode(statsMode) {
      const court = session.getCourtSession();
      const config = buildMatchConfig(this.configForm, statsMode);
      const selected = this.selectedPlayers();
      const draft = startDraft({
        selectedPlayers: selected,
        isDoubles: this.isDoubles,
        isMixedDoubles: this.isDoubles && this.isMixedSelection(selected),
        courtId: court.courtId,
        courtName: court.courtName,
        scheduleId: this.suggestion?.id ?? this.suggestion?.schedule_id ?? null,
        config,
        umpireName: this.configForm.umpireName,
        manualStartTime: this.configForm.manualStartTime
          ? Date.parse(this.configForm.manualStartTime)
          : null,
      });
      session.saveDraft(draft);
      this.draft = draft;
      this.go('serve');
    },

    isMixedSelection(players) {
      const genders = players.map((player) => String(player.gender || '').toUpperCase());
      const hasWomen = genders.some((gender) => gender === 'F' || gender === 'K');
      const hasMen = genders.some((gender) => gender === 'M');
      return hasWomen && hasMen;
    },

    back() {
      const from = {
        tournament: 'language',
        court: 'tournament',
        players: 'court',
        config: 'players',
        serve: 'config',
        settings: this.settingsFrom || 'court',
      };
      if (this.screen === 'language') return;
      if (this.screen === 'court' && this.pinOpen) {
        this.closePin();
        return;
      }
      this.go(from[this.screen] || 'language');
    },

    openSettings() {
      this.settingsFrom = this.screen;
      this.go('settings');
    },
  };
}

window.Alpine = Alpine;
Alpine.data('umpireApp', createUmpireApp);
Alpine.start();

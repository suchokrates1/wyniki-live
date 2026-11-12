import {
  buildMatchConfig,
  DEFAULT_MATCH_CONFIG_FORM,
  normalizeTiebreakAtGames,
  startDraft,
} from '../matchConfigForm.js';
import { tiebreakAtOptions } from '../match-engine/models.js';
import { createMatchFromDraft } from '../match/createMatchFromDraft.js';
import { suggestionScheduleId } from '../match/suggestion.js';
import { playerRowClass as selectionRowClass } from '../playerRowClass.js';
import { TUTORIAL_MATCH_UUID, tutorialCatalog } from '../tutorial/catalog.js';

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

export function formFromLastConfig(last) {
  if (!last) return { ...DEFAULT_MATCH_CONFIG_FORM };
  return {
    ...DEFAULT_MATCH_CONFIG_FORM,
    gamesPerSet: last.gamesPerSet ?? DEFAULT_MATCH_CONFIG_FORM.gamesPerSet,
    setsToWin: last.setsToWin ?? DEFAULT_MATCH_CONFIG_FORM.setsToWin,
    tiebreakPoints: last.tiebreakPoints ?? DEFAULT_MATCH_CONFIG_FORM.tiebreakPoints,
    superTiebreakPoints: last.superTiebreakPoints ?? DEFAULT_MATCH_CONFIG_FORM.superTiebreakPoints,
    tiebreakAtGames: normalizeTiebreakAtGames(
      last.gamesPerSet ?? DEFAULT_MATCH_CONFIG_FORM.gamesPerSet,
      last.tiebreakAtGames,
    ),
    tbOnlyPoints: last.tbOnlyPoints ?? DEFAULT_MATCH_CONFIG_FORM.tbOnlyPoints,
    noAdvantage: Boolean(last.noAdvantage),
    tiebreakOnly: Boolean(last.tiebreakOnly),
    umpireName: last.umpireName || '',
    advancedStats: last.advancedStats === true || last.statsMode === 'ADVANCED',
  };
}

export function createUmpirePlayersAndConfigSlice({ api, session }) {
  return {
    dismissSuggestion() {
      this.suggestion = null;
    },

    async loadPlayers() {
      if (this.tutorialMode) {
        this.players = tutorialCatalog((key) => this.t(key)).players;
        this.suggestion = null;
        return;
      }
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

    playerRowClass(player) {
      return selectionRowClass(this.isDoubles, this.isSelected(player) ? this.selectionIndex(player) : -1);
    },

    setSingles() {
      this.isDoubles = false;
      this.selectedIds = this.selectedIds.slice(0, 2);
      this.scheduleAdvanceToConfig();
    },

    setDoubles() {
      this.isDoubles = true;
    },

    selectionIndex(player) {
      return this.selectedIds.indexOf(playerId(player));
    },

    togglePlayer(player) {
      this.selectedScheduleId = null;
      this.team1Name = null;
      this.team2Name = null;
      const id = playerId(player);
      const index = this.selectedIds.indexOf(id);
      if (index >= 0) {
        this.selectedIds = this.selectedIds.filter((item) => item !== id);
        return;
      }
      if (this.selectedIds.length >= neededCount(this.isDoubles)) return;
      this.selectedIds = [...this.selectedIds, id];
      this.scheduleAdvanceToConfig();
    },

    scheduleAdvanceToConfig() {
      clearTimeout(this._advanceTimer);
      if (!this.canContinuePlayers()) return;
      if (this.tutorialMode) {
        this.tutorialNote('selectPlayers');
        return;
      }
      this._advanceTimer = setTimeout(() => {
        if (this.screen === 'players' && this.canContinuePlayers()) this.openConfig();
      }, 300);
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
      this.selectedScheduleId = suggestionScheduleId(suggestion);
      this.team1Name = suggestion.player1_name || null;
      this.team2Name = suggestion.player2_name || null;
      this.scheduleAdvanceToConfig();
    },

    async saveNewPlayer() {
      const court = session.getCourtSession();
      const lastName = this.addForm.lastName.trim();
      if (!court?.courtId || !lastName) return;
      this.loading = true;
      const firstName = this.addForm.firstName.trim();
      const country = this.addForm.country.trim().toUpperCase();
      const { ok, data } = await api.addPlayer({
        kort_id: court.courtId,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        country_code: country || undefined,
        category: this.addForm.category.trim() || undefined,
      });
      this.loading = false;
      if (!ok) {
        this.error = this.t('error');
        return;
      }
      this.showAddPlayer = false;
      this.addForm = { firstName: '', lastName: '', country: '', category: '' };
      await this.loadPlayers();
      const created = data?.player || data;
      if (created?.id) this.togglePlayer(created);
    },

    openConfig() {
      if (!this.canContinuePlayers()) return;
      if (this.tutorialMode) {
        this.configForm = { ...DEFAULT_MATCH_CONFIG_FORM };
        this.go('config');
        return;
      }
      const last = session.getLastMatchConfig();
      this.configForm = last ? formFromLastConfig(last) : { ...DEFAULT_MATCH_CONFIG_FORM };
      this.go('config');
    },

    tiebreakAtChoices() {
      return tiebreakAtOptions(this.configForm.gamesPerSet);
    },

    setGamesPerSet(value) {
      this.configForm.gamesPerSet = value;
      this.configForm.tiebreakAtGames = normalizeTiebreakAtGames(value, this.configForm.tiebreakAtGames);
    },

    startMatch() {
      this.startWithMode(this.configForm.advancedStats ? 'ADVANCED' : 'BASIC');
    },

    startWithMode(statsMode) {
      const court = this.tutorialMode ? this.tutorialCourtSession : session.getCourtSession();
      const config = buildMatchConfig(this.configForm, statsMode);
      const selected = this.selectedPlayers();
      const draft = startDraft({
        selectedPlayers: selected,
        isDoubles: this.isDoubles,
        isMixedDoubles: this.isDoubles && this.isMixedSelection(selected),
        team1Name: this.team1Name,
        team2Name: this.team2Name,
        courtId: court.courtId,
        courtName: court.courtName,
        scheduleId: this.selectedScheduleId,
        config,
        umpireName: this.configForm.umpireName,
        manualStartTime: this.configForm.manualStartTime
          ? Date.parse(this.configForm.manualStartTime)
          : null,
      });
      if (this.tutorialMode) {
        draft.clientMatchUuid = TUTORIAL_MATCH_UUID;
        this.draft = draft;
        this.match.initialize(createMatchFromDraft(draft));
        this.tutorialNote('startMatch');
        this.go('match');
        return;
      }
      session.saveDraft(draft);
      session.saveLastMatchConfig({ ...this.configForm, statsMode });
      this.draft = draft;
      this.match.initialize(createMatchFromDraft(draft));
      this.go('match');
    },

    isMixedSelection(players) {
      const genders = players.map((player) => String(player.gender || '').toUpperCase());
      const hasWomen = genders.some((gender) => gender === 'F' || gender === 'K');
      const hasMen = genders.some((gender) => gender === 'M');
      return hasWomen && hasMen;
    },
  };
}

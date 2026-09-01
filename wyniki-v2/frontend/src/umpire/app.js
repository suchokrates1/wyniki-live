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
import { FinishMatchRequest, MatchFinishReason } from './match-engine/models.js';
import { announcementContent } from './match/announcementView.js';
import { buildAdvancedRally, buildAdvancedServe } from './match/advancedScoringView.js';
import { buildBasicScoring } from './match/basicScoringView.js';
import { createMatchFromDraft } from './match/createMatchFromDraft.js';
import { createMatchController } from './match/matchController.js';
import { finishWinnerName, toFinishPayload, toMatchPayload, toStatisticsPayload } from './match/matchPayload.js';
import { hydrateMatchState, serializeMatchState } from './match/matchStateIo.js';
import { matchTimerText } from './match/matchTimer.js';
import { MatchView } from './match/matchViews.js';
import { suggestionScheduleId } from './match/suggestion.js';
import { buildScoreboard } from './match/scoreboardView.js';
import { buildServerButtons, resolveServerNumber } from './match/serverSelection.js';
import { createWakeLock } from './match/wakeLock.js';
import './umpire.css';

const session = createUmpireSession();
const wakeLock = createWakeLock();

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

function formFromLastConfig(last) {
  if (!last) return { ...DEFAULT_MATCH_CONFIG_FORM };
  return {
    ...DEFAULT_MATCH_CONFIG_FORM,
    gamesPerSet: last.gamesPerSet ?? DEFAULT_MATCH_CONFIG_FORM.gamesPerSet,
    setsToWin: last.setsToWin ?? DEFAULT_MATCH_CONFIG_FORM.setsToWin,
    tiebreakPoints: last.tiebreakPoints ?? DEFAULT_MATCH_CONFIG_FORM.tiebreakPoints,
    superTiebreakPoints: last.superTiebreakPoints ?? DEFAULT_MATCH_CONFIG_FORM.superTiebreakPoints,
    tbOnlyPoints: last.tbOnlyPoints ?? DEFAULT_MATCH_CONFIG_FORM.tbOnlyPoints,
    noAdvantage: Boolean(last.noAdvantage),
    tiebreakOnly: Boolean(last.tiebreakOnly),
    umpireName: last.umpireName || '',
  };
}

function createUmpireApp() {
  const pinPad = createPinPad();
  const api = createUmpireApi({
    getToken: () => session.getCourtSession()?.token || null,
  });

  return {
    languages: AVAILABLE_LANGUAGES,
    screen: firstScreen({
      hasLanguage: session.hasLanguageSelected(),
      hasTournamentToday: Boolean(session.getTournamentForToday()),
    }),
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
    addForm: { firstName: '', lastName: '', country: '', category: '' },
    team1Name: null,
    team2Name: null,
    selectedScheduleId: null,
    _advanceTimer: null,
    pinOpen: false,
    pinCourt: null,
    pinBusy: false,
    pinError: '',
    pinBoxes: ['', '', '', ''],
    configForm: { ...DEFAULT_MATCH_CONFIG_FORM },
    draft: null,
    settingsFrom: 'court',
    match: null,
    matchRev: 0,
    timerText: '00:00',
    _timerId: null,
    dialog: null,
    finishStep: null,

    t(key, vars) {
      return umpireText(this.lang, key, vars);
    },

    init() {
      this.match = createMatchController({
        onChange: () => this.onMatchChange(),
        onSync: (reason, state, extra) => this.syncMatch(reason, state, extra),
      });
      const hashScreen = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
      if (hashScreen) this.screen = hashScreen;
      this.restoreActiveMatch();
      this.ensureMatchFromDraft();
      this.go(this.screen, { replace: true });
      window.addEventListener('hashchange', () => this.syncFromHash());
      window.addEventListener('beforeunload', (event) => {
        if (this.match?.chrome()?.confirmLeave) {
          event.preventDefault();
          event.returnValue = '';
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.screen === 'match' && this.match?.state?.matchStartTime) {
          wakeLock.request();
        }
      });
      this._timerId = setInterval(() => {
        if (this.match?.state) this.timerText = matchTimerText(this.match.state, Date.now());
      }, 1000);
    },

    onMatchChange() {
      this.matchRev += 1;
      if (this.match?.state) {
        this.timerText = matchTimerText(this.match.state, Date.now());
        session.saveActiveMatch({
          view: this.match.view,
          pendingAnnouncementType: this.match.pendingAnnouncementType,
          canUndo: this.match.canUndo,
          state: serializeMatchState(this.match.state),
        });
      }
    },

    ensureMatchFromDraft() {
      this.draft = session.getDraft();
      if (!this.match?.state && this.draft) {
        this.match.initialize(createMatchFromDraft(this.draft));
      }
    },

    restoreActiveMatch() {
      const snapshot = session.getActiveMatch();
      if (!snapshot?.state) return;
      const state = hydrateMatchState(snapshot.state);
      if (!state) return;
      this.match.restoreSnapshot({
        state,
        view: snapshot.view,
        pendingAnnouncementType: snapshot.pendingAnnouncementType,
        canUndo: snapshot.canUndo,
      });
      this.screen = 'match';
    },

    syncFromHash() {
      const name = (location.hash.replace(/^#\/?/, '') || this.screen).split('/')[0];
      if (name === 'match' && this.match?.chrome()?.confirmLeave && this.screen === 'match') return;
      if (name && name !== this.screen) {
        if (this.screen === 'match' && this.match?.chrome()?.confirmLeave) {
          this.dialog = 'leave';
          history.forward();
          return;
        }
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
      if (name === 'serve') this.go('match', { replace: true });
      if (name === 'match') this.ensureMatchFromDraft();
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
      const last = session.getLastMatchConfig();
      this.configForm = last ? formFromLastConfig(last) : { ...DEFAULT_MATCH_CONFIG_FORM };
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

    screenTitle() {
      this.matchRev;
      const titles = {
        language: 'languageTitle',
        tournament: 'tournamentTitle',
        court: 'courtTitle',
        players: 'playersTitle',
        config: 'configTitle',
        serve: 'serveTitle',
        match: this.matchView() === MatchView.SERVER_SELECTION ? 'serveTitle' : 'matchTitle',
        settings: 'settings',
      };
      return this.t(titles[this.screen] || 'appName');
    },

    back() {
      if (this.screen === 'match') {
        if (this.match?.chrome()?.confirmLeave) {
          this.dialog = 'leave';
          return;
        }
        this.leaveMatch();
        return;
      }
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

    leaveMatch() {
      wakeLock.release();
      session.clearActiveMatch();
      this.dialog = null;
      const finished = this.match?.state?.isMatchFinished;
      this.go(finished ? 'players' : 'config');
    },

    confirmLeave() {
      this.leaveMatch();
    },

    openSettings() {
      this.settingsFrom = this.screen;
      this.go('settings');
    },

    matchView() {
      this.matchRev;
      return this.match?.view || MatchView.SERVER_SELECTION;
    },

    matchState() {
      this.matchRev;
      return this.match?.state || null;
    },

    chrome() {
      this.matchRev;
      return this.match?.chrome() || {
        showScoreboard: false,
        showUndo: false,
        showFinish: false,
        undoEnabled: false,
        confirmLeave: false,
        showTimer: false,
      };
    },

    scoreboard() {
      this.matchRev;
      return this.match?.state ? buildScoreboard(this.match.state) : null;
    },

    serverButtons() {
      this.matchRev;
      return this.match?.state ? buildServerButtons(this.match.state).filter((button) => button.visible) : [];
    },

    basicView() {
      this.matchRev;
      return this.match?.state ? buildBasicScoring(this.match.state) : null;
    },

    announcement() {
      this.matchRev;
      if (!this.match?.state) return null;
      return announcementContent(this.match.pendingAnnouncementType, this.match.state, (key, vars) => this.t(key, vars));
    },

    syncLabel() {
      this.matchRev;
      const status = this.match?.syncStatus || 'IDLE';
      return this.t({
        IDLE: 'syncIdle',
        SYNCING: 'syncSyncing',
        SYNCED: 'syncSynced',
        FAILED: 'syncFailed',
        OFFLINE: 'syncOffline',
      }[status] || 'syncIdle');
    },

    chooseServer(buttonIndex) {
      const state = this.match?.state;
      if (!state) return;
      this.match.setFirstServer(resolveServerNumber(buttonIndex, state));
      wakeLock.request();
    },

    swapSides() {
      this.match?.swapSides();
    },

    basicWin(isPlayer1) {
      this.match?.handleBasicWin(isPlayer1);
    },

    basicFault() {
      this.match?.handleBasicFault();
    },

    advancedServe() {
      this.matchRev;
      return this.match?.state ? buildAdvancedServe(this.match.state) : null;
    },

    advancedRally() {
      this.matchRev;
      return this.match?.state ? buildAdvancedRally(this.match.state) : null;
    },

    ace() {
      this.match?.handleAce();
    },

    fault() {
      this.match?.handleFault();
    },

    footFault() {
      this.match?.handleFootFault();
    },

    ballInPlay() {
      this.match?.handleBallInPlay();
    },

    winner(isPlayer1) {
      this.match?.handleWinner(isPlayer1);
    },

    forcedError(isPlayer1) {
      this.match?.handleForcedError(isPlayer1);
    },

    unforcedError(isPlayer1) {
      this.match?.handleUnforcedError(isPlayer1);
    },

    continueAnnouncement() {
      this.match?.continueFromAnnouncement();
    },

    skipSideChange() {
      this.match?.skipSideChange();
    },

    askUndo() {
      if (!this.chrome().undoEnabled) return;
      this.dialog = 'undo';
    },

    confirmUndo() {
      this.dialog = null;
      this.match?.undoLastAction();
    },

    askFinish() {
      if (!this.chrome().showFinish) return;
      this.finishStep = 'reason';
      this.dialog = 'finish';
    },

    pickFinishReason(reason) {
      if (reason === MatchFinishReason.RETIREMENT) {
        this.finishStep = 'retirement';
        return;
      }
      if (reason === MatchFinishReason.WALKOVER) {
        this.finishStep = 'walkover';
        return;
      }
      this.confirmFinish(new FinishMatchRequest({ finishReason: reason }));
    },

    pickRetirement(injuredIsTeam1) {
      const state = this.match.state;
      this.confirmFinish(new FinishMatchRequest({
        finishReason: MatchFinishReason.RETIREMENT,
        injuredPlayerName: injuredIsTeam1 ? state.getTeam1FullName() : state.getTeam2FullName(),
        winnerName: injuredIsTeam1 ? state.getTeam2FullName() : state.getTeam1FullName(),
      }));
    },

    pickWalkover(winnerIsTeam1) {
      const state = this.match.state;
      this.confirmFinish(new FinishMatchRequest({
        finishReason: MatchFinishReason.WALKOVER,
        winnerName: winnerIsTeam1 ? state.getTeam1FullName() : state.getTeam2FullName(),
      }));
    },

    confirmFinish(request) {
      this.dialog = null;
      this.finishStep = null;
      this.match.finishMatchWithOutcome(request);
      wakeLock.release();
    },

    winnerName() {
      return this.match?.state ? finishWinnerName(this.match.state) : '';
    },

    gameModeLabel() {
      const board = this.scoreboard();
      if (!board?.gameMode) return '';
      return board.gameMode === 'super_tiebreak'
        ? this.t('superTiebreakMode', { points: board.gameModePoints })
        : this.t('tiebreakMode', { points: board.gameModePoints });
    },

    statsLine(field) {
      const state = this.match?.state;
      if (!state) return '';
      return `${state.player1Stats[field]} / ${state.player2Stats[field]}`;
    },

    servePctLine() {
      const state = this.match?.state;
      if (!state) return '';
      return `${state.player1Stats.getFirstServePercentage()}% / ${state.player2Stats.getFirstServePercentage()}%`;
    },

    nextMatch(sameSetup) {
      wakeLock.release();
      session.clearActiveMatch();
      this.selectedIds = [];
      this.team1Name = null;
      this.team2Name = null;
      this.selectedScheduleId = null;
      this.suggestion = null;
      this.configForm = sameSetup
        ? formFromLastConfig(session.getLastMatchConfig())
        : { ...DEFAULT_MATCH_CONFIG_FORM };
      if (!sameSetup) session.clearLastMatchConfig();
      this.go('players');
    },

    async syncMatch(reason, state, extra) {
      try {
        if (reason === 'create' || state.matchId == null) {
          const { ok, data } = await api.createMatch(toMatchPayload(state));
          if (!ok) return { failed: true, offline: !navigator.onLine };
          return { matchId: data?.id };
        }
        const update = await api.updateMatch(state.matchId, toMatchPayload(state));
        if (!update.ok) return { failed: true, offline: !navigator.onLine };
        if (reason === 'finalize') {
          const request = extra || new FinishMatchRequest({
            finishReason: state.finishReason,
            winnerName: state.finishWinnerName,
            injuredPlayerName: state.injuredPlayerName,
            resultNote: state.resultNote,
          });
          const finish = await api.finishMatch(state.matchId, toFinishPayload(request));
          if (!finish.ok && finish.status !== 403) return { failed: true };
          const stats = toStatisticsPayload(state);
          if (stats) await api.sendStatistics(stats);
        }
        return { matchId: state.matchId };
      } catch {
        return { failed: true, offline: !navigator.onLine };
      }
    },
  };
}

window.Alpine = Alpine;
Alpine.data('umpireApp', createUmpireApp);
Alpine.start();

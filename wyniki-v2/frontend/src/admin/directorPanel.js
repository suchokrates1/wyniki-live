/** The director's remote: reading a tablet's live score and pushing a new one back. */

import {
  applyTabletToDirectorForm,
  asPlayerList,
  defaultTiebreakAtGames,
  directorDeviceCard,
  filterTournamentPlayers,
  formatScoreLine,
  playerDisplayName,
  tournamentIdFromCourtId,
} from './directorDevice.js';

export function createDirectorPanel() {
  return {
      directorPanelOpen: false,
      directorLoading: false,
      directorSaving: false,
      directorTablets: [],
      directorSelected: null,
      directorLoadedScore: null,
      directorPlayers: [],
      directorPlayersTournamentId: null,
      directorPlayerPicker: 0,
      directorPlayerQuery: '',
      directorForm: {
        sessionCourtId: '',
        matchId: null,
        courtId: '',
        player1Name: '',
        player2Name: '',
        player1Sets: 0,
        player2Sets: 0,
        player1Games: 0,
        player2Games: 0,
        player1Points: 0,
        player2Points: 0,
        gamesPerSet: 4,
        setsToWin: 2,
        tiebreakAtGames: 4,
        noAdvantage: false,
        tiebreakOnly: false,
        statsMode: 'ADVANCED',
      },

      async openDirectorPanel(kortId) {
        this.directorPanelOpen = true;
        this.directorLoading = true;
        this.directorPlayerPicker = 0;
        this.directorPlayerQuery = '';
        this.directorForm.sessionCourtId = kortId;
        this.directorForm.courtId = kortId;
        try {
          const [tabletsRes, matchHint] = await Promise.all([
            fetch('/admin/api/director/tablets?court_id=' + encodeURIComponent(kortId)),
            Promise.resolve(this.courtData[kortId] || {}),
            this.loadDirectorPlayers(kortId),
          ]);
          if (!tabletsRes.ok) throw new Error('Nie udało się wczytać tabletów');
          const payload = await tabletsRes.json();
          this.directorTablets = payload.tablets || [];
          const first = this.directorTablets[0];
          if (first) {
            await this.selectDirectorTablet(first);
          } else {
            this.directorSelected = null;
            const a = matchHint.A || {};
            const b = matchHint.B || {};
            this.directorForm.player1Name = a.full_name || a.surname || '';
            this.directorForm.player2Name = b.full_name || b.surname || '';
            this.directorForm.player1Games = a.current_games || 0;
            this.directorForm.player2Games = b.current_games || 0;
          }
        } catch (err) {
          console.error(err);
          this.showToast(err.message || 'Błąd reżyserki', 'error');
        } finally {
          this.directorLoadedScore = this.directorScorePayload();
          this.directorLoading = false;
        }
      },

      directorFilteredPlayers() {
        return filterTournamentPlayers(this.directorPlayers, this.directorPlayerQuery);
      },

      directorPlayerName(player) {
        return playerDisplayName(player);
      },

      async loadDirectorPlayers(courtId) {
        const row = this.courts.find((court) => court.kort_id === courtId);
        const tournamentId = row?.tournament_id || tournamentIdFromCourtId(courtId);
        if (!tournamentId) {
          this.directorPlayers = [];
          this.directorPlayersTournamentId = null;
          return;
        }
        if (this.directorPlayersTournamentId === tournamentId && this.directorPlayers.length) return;
        try {
          const response = await fetch('/admin/api/tournaments/' + tournamentId + '/players');
          if (!response.ok) throw new Error('Nie udało się wczytać zawodników');
          this.directorPlayers = asPlayerList(await response.json());
          this.directorPlayersTournamentId = tournamentId;
        } catch (err) {
          console.error(err);
          this.directorPlayers = [];
          this.directorPlayersTournamentId = null;
          this.showToast(err.message || 'Błąd listy zawodników', 'error');
        }
      },

      openDirectorPlayerPicker(side) {
        this.directorPlayerPicker = side;
        this.directorPlayerQuery = '';
        this.$nextTick(() => {
          const field = this.$root?.querySelector?.(`[data-director-player-search="${side}"]`);
          field?.focus();
          field?.select?.();
        });
      },

      closeDirectorPlayerPicker(side) {
        if (this.directorPlayerPicker === side) this.directorPlayerPicker = 0;
      },

      pickDirectorPlayer(side, player) {
        const name = playerDisplayName(player);
        if (side === 1) this.directorForm.player1Name = name;
        else this.directorForm.player2Name = name;
        this.directorPlayerPicker = 0;
        this.directorPlayerQuery = '';
      },

      pickFirstDirectorPlayer() {
        const first = this.directorFilteredPlayers()[0];
        if (first) this.pickDirectorPlayer(this.directorPlayerPicker, first);
      },

      directorTabletLabel(tablet) {
        const bits = [];
        if (tablet.label) bits.push(tablet.label);
        if (tablet.platform === 'pwa') bits.push('PWA');
        else if (tablet.platform === 'android') bits.push('Android');
        if (tablet.battery_level != null && tablet.battery_level !== '') {
          bits.push(tablet.battery_level + '%' + (tablet.is_charging ? ' ⚡' : ''));
        }
        bits.push((tablet.player1_name || '?') + ' vs ' + (tablet.player2_name || '?'));
        if (tablet.snapshot) bits.push(formatScoreLine(tablet.snapshot));
        if (tablet.match_id) bits.push('#' + tablet.match_id);
        if (tablet.session_court_id) bits.push(tablet.session_court_id);
        return bits.join(' · ');
      },

      directorDeviceCard() {
        return directorDeviceCard(this.directorSelected, Date.now()) || {
          title: '', source: '', court: '', clock: '', names: '', score: '', rules: '', fresh: false,
        };
      },

      async selectDirectorTablet(tablet) {
        this.directorSelected = tablet || null;
        Object.assign(this.directorForm, applyTabletToDirectorForm(tablet || {}));
        if (!tablet?.match_id) {
          this.directorLoadedScore = this.directorScorePayload();
          return;
        }
        if (tablet.snapshot) {
          this.directorLoadedScore = this.directorScorePayload();
          return;
        }
        const response = await fetch('/api/matches/' + tablet.match_id);
        if (!response.ok) {
          this.directorLoadedScore = this.directorScorePayload();
          return;
        }
        const match = await response.json();
        const score = match.score || {};
        this.directorForm.courtId = match.court_id || this.directorForm.courtId;
        this.directorForm.player1Name = match.player1_name || this.directorForm.player1Name;
        this.directorForm.player2Name = match.player2_name || this.directorForm.player2Name;
        this.directorForm.player1Sets = score.player1_sets || 0;
        this.directorForm.player2Sets = score.player2_sets || 0;
        this.directorForm.player1Games = score.player1_games || 0;
        this.directorForm.player2Games = score.player2_games || 0;
        this.directorForm.player1Points = score.player1_points || 0;
        this.directorForm.player2Points = score.player2_points || 0;
        const config = match.match_config || {};
        this.directorForm.gamesPerSet = config.games_per_set || 4;
        this.directorForm.setsToWin = config.sets_to_win || 2;
        this.directorForm.tiebreakAtGames = config.tiebreak_at_games
          || defaultTiebreakAtGames(config.games_per_set || 4);
        this.directorForm.noAdvantage = !!config.no_advantage;
        this.directorForm.tiebreakOnly = !!config.tiebreak_only;
        this.directorForm.statsMode = config.stats_mode || 'ADVANCED';
        this.directorLoadedScore = this.directorScorePayload();
      },

      directorScorePayload() {
        return {
          player1_sets: Number(this.directorForm.player1Sets) || 0,
          player2_sets: Number(this.directorForm.player2Sets) || 0,
          player1_games: Number(this.directorForm.player1Games) || 0,
          player2_games: Number(this.directorForm.player2Games) || 0,
          player1_points: Number(this.directorForm.player1Points) || 0,
          player2_points: Number(this.directorForm.player2Points) || 0,
        };
      },

      async applyDirectorControl() {
        if (!this.directorForm.matchId) {
          this.showToast('Wybierz mecz / tablet', 'warning');
          return;
        }
        this.directorSaving = true;
        try {
          const response = await fetch('/admin/api/matches/' + this.directorForm.matchId + '/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_court_id: this.directorForm.sessionCourtId,
              court_id: this.directorForm.courtId,
              player1_name: this.directorForm.player1Name,
              player2_name: this.directorForm.player2Name,
              // the loaded score is the last game the tablet sent, not the points of the game in play:
              // sending it unchanged with a court move would roll the tablet back
              ...(JSON.stringify(this.directorScorePayload()) !== JSON.stringify(this.directorLoadedScore || null)
                ? { score: this.directorScorePayload() }
                : {}),
              match_config: {
                games_per_set: Number(this.directorForm.gamesPerSet) || 4,
                sets_to_win: Number(this.directorForm.setsToWin) || 2,
                tiebreak_at_games: Number(this.directorForm.tiebreakAtGames)
                  || defaultTiebreakAtGames(Number(this.directorForm.gamesPerSet) || 4),
                no_advantage: !!this.directorForm.noAdvantage,
                tiebreak_only: !!this.directorForm.tiebreakOnly,
                stats_mode: this.directorForm.statsMode || 'ADVANCED',
              },
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || 'Nie udało się wysłać na tablet');
          this.showToast('Wysłano na tablet', 'success');
          this.directorPanelOpen = false;
        } catch (err) {
          console.error(err);
          this.showToast(err.message || 'Błąd sterowania tabletem', 'error');
        } finally {
          this.directorSaving = false;
        }
      },
  };
}

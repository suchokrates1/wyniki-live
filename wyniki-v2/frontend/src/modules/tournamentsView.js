import { publicApi } from '../api/publicApi.js';
import {
  buildTournamentAccessQuery,
  getClearedTournamentDetailState,
  getSelectedTournamentName,
  getTournamentOpenState,
} from './tournaments.js';

export function createTournamentView() {
  return {
    tournaments: [],
    selectedTournamentId: '',
    tournamentHistory: [],
    tournamentBracket: null,
    tournamentSchedule: null,
    tournamentBracketCategory: null,
    privateTournamentAccessKey: '',
    simulationStage: '',
    historySubTab: 'bracket',

    sortedTournamentHistory() {
      return [...this.tournamentHistory].sort((a, b) => {
        const ta = a.ended_ts || a.timestamp || '';
        const tb = b.ended_ts || b.timestamp || '';
        return tb.localeCompare(ta);
      });
    },

    async openTournamentHistorySubTab(subTab) {
      this.historySubTab = subTab;
      await this.fetchTournaments();
      if (this.selectedTournamentId) {
        if (subTab === 'schedule') await this.fetchTournamentSchedule(this.selectedTournamentId);
        else if (subTab === 'matches') await this.fetchTournamentHistory(this.selectedTournamentId);
        else await this.fetchTournamentBracket(this.selectedTournamentId);
      }
      this._updateHash(true);
    },

    async selectTournamentBracketCategory(categoryName) {
      this.tournamentBracketCategory = categoryName;
      if (this.selectedTournamentId) await this.fetchTournamentBracket(this.selectedTournamentId);
    },

    async fetchTournaments() {
      try {
        const data = await publicApi.getTournaments();
        if (!data) return;
        this.tournaments = Array.isArray(data) ? data : [];
      } catch {
        /* ignore */
      }
    },

    openTournament(tournamentId) {
      Object.assign(this, getTournamentOpenState(tournamentId));
      this.onTournamentSelected();
      this._updateHash();
    },

    selectedTournamentName() {
      return getSelectedTournamentName(this.tournaments, this.selectedTournamentId, this.tournamentBracket);
    },

    closeTournamentDetail() {
      this.selectedTournamentId = '';
      history.back();
    },

    async onTournamentSelected() {
      const tournamentId = this.selectedTournamentId;
      if (!tournamentId) {
        Object.assign(this, getClearedTournamentDetailState());
        return;
      }
      await Promise.all([
        this.fetchTournamentHistory(tournamentId),
        this.fetchTournamentBracket(tournamentId),
        this.fetchTournamentSchedule(tournamentId),
      ]);
    },

    async fetchTournamentHistory(tournamentId) {
      try {
        const data = await publicApi.getTournamentHistory(tournamentId, this._tournamentAccessQuery());
        if (!data) {
          this.tournamentHistory = [];
          return;
        }
        this.tournamentHistory = Array.isArray(data) ? data : [];
      } catch {
        this.tournamentHistory = [];
      }
    },

    async fetchTournamentBracket(tournamentId) {
      try {
        this.tournamentBracket = await publicApi.getTournamentBracket(tournamentId, this._tournamentAccessQuery());
        if (!this.tournamentBracket) {
          this.tournamentBracket = null;
          return;
        }
        this._buildBracketNameMap(this.tournamentBracket);
        const categories = this.tournamentBracketCategories();
        if (categories.length > 0 && !categories.find((category) => category.name === this.tournamentBracketCategory)) {
          this.tournamentBracketCategory = categories[0].name;
        }
      } catch {
        this.tournamentBracket = null;
      }
    },

    async fetchTournamentSchedule(tournamentId) {
      try {
        this.tournamentSchedule = await publicApi.getTournamentSchedule(tournamentId, this._tournamentAccessQuery());
        if (!this.tournamentSchedule) this.tournamentSchedule = null;
      } catch {
        this.tournamentSchedule = null;
      }
    },

    _tournamentAccessQuery() {
      return buildTournamentAccessQuery({
        accessKey: this.privateTournamentAccessKey,
        simulationStage: this.simulationStage,
      });
    },
  };
}
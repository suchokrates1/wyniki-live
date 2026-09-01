import { publicApi } from '../api/publicApi.js';
import { registerCompetitorName } from '../shared/teamDisplay.js';
import {
  filterMatchHistory,
  getMatchSets as getHistoryMatchSets,
  getMatchWinner as getHistoryMatchWinner,
  getStatsRowsPaired as getHistoryStatsRowsPaired,
  historyFilterOptions,
} from './history.js';

export function createHistoryView() {
  return {
    history: [],
    expandedMatchStats: {},
    historySearch: '',
    historyCategory: '',
    historyCourt: '',
    historyDate: '',

    historyFilters() {
      return {
        search: this.historySearch,
        category: this.historyCategory,
        court: this.historyCourt,
        date: this.historyDate,
      };
    },

    historyHasActiveFilters() {
      const filters = this.historyFilters();
      return Boolean(filters.search || filters.category || filters.court || filters.date);
    },

    clearHistoryFilters() {
      this.historySearch = '';
      this.historyCategory = '';
      this.historyCourt = '';
      this.historyDate = '';
    },

    filteredHistoryList(matches = []) {
      const sorted = [...matches].sort((a, b) => {
        const ta = a.ended_ts || a.timestamp || '';
        const tb = b.ended_ts || b.timestamp || '';
        return tb.localeCompare(ta);
      });
      return filterMatchHistory(sorted, this.historyFilters());
    },

    sortedHistory() {
      return this.filteredHistoryList(this.history);
    },

    historyFilterChoices(matches = this.history) {
      const options = historyFilterOptions(matches);
      return {
        categories: [...options.categories].sort((left, right) => this.compareBracketCategoryNames(left, right)),
        courts: options.courts,
        dates: options.dates,
      };
    },

    historyDateLabel(dateKey) {
      if (!dateKey) return '';
      const date = new Date(`${dateKey}T12:00:00`);
      if (Number.isNaN(date.getTime())) return dateKey;
      return date.toLocaleDateString(this.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
    },

    historyCourtLabel(court) {
      if (!court) return '';
      const prefix = this.tr().history?.court || 'Kort';
      return `${prefix} ${court.label || court.value}`;
    },

    async fetchHistory() {
      try {
        const data = await publicApi.getHistory();
        if (!data) return;
        this.history = Array.isArray(data) ? data : [];
        for (const match of this.history) {
          registerCompetitorName(this.bracketNameMap, match.player_a);
          registerCompetitorName(this.bracketNameMap, match.player_b);
        }
      } catch { /* ignore */ }
    },

    getMatchWinner(match) {
      return getHistoryMatchWinner(match);
    },

    getMatchSets(match) {
      return getHistoryMatchSets(match);
    },

    getStatsRowsPaired(stats) {
      return getHistoryStatsRowsPaired(stats, this.tr().stats || {});
    },

    getHistoryAriaLabel(match) {
      const h = this.tr().history || {};
      const courtName = match.court_name || match.kort_id || this.acc().unknownCourt || 'kort nieustalony';
      const winner = this.getMatchWinner(match);
      const winnerName = winner === 'A'
        ? match.player_a
        : winner === 'B'
          ? match.player_b
          : '';
      const intro = [];
      if (match.tournament_name) intro.push(match.tournament_name);
      intro.push(`${h.court || this.acc().court || 'Kort'}: ${courtName}`);

      return this.buildCompletedMatchAria({
        intro,
        playerA: match.player_a,
        playerB: match.player_b,
        winnerName,
        scoreText: this.describeHistorySetsForSpeech(match),
        details: [
          match.category ? `${h.category || 'Kategoria'}: ${this.translateCategory(match.category)}` : '',
          match.phase ? `${this.acc().phase || 'Etap'}: ${this.translatePhase(match.phase)}` : '',
          match.duration_seconds ? `${h.time || this.acc().duration || 'Czas'}: ${this.formatTime(match.duration_seconds)}` : '',
        ],
      });
    },

    async toggleMatchDetails(matchId) {
      if (!matchId) return;
      const key = String(matchId);

      if (this.expandedMatchStats[key]) {
        delete this.expandedMatchStats[key];
        this.expandedMatchStats = { ...this.expandedMatchStats };
        return;
      }

      try {
        this.expandedMatchStats = { ...this.expandedMatchStats, [key]: { loading: true } };
        const data = await publicApi.getMatchStats(matchId);
        if (!data) {
          this.expandedMatchStats = { ...this.expandedMatchStats, [key]: { error: true } };
          return;
        }
        this.expandedMatchStats = { ...this.expandedMatchStats, [key]: data };
      } catch {
        this.expandedMatchStats = { ...this.expandedMatchStats, [key]: { error: true } };
      }
    },

    isMatchExpanded(matchId) {
      return matchId && !!this.expandedMatchStats[String(matchId)];
    },

    getMatchStats(matchId) {
      return matchId ? this.expandedMatchStats[String(matchId)] : null;
    },
  };
}
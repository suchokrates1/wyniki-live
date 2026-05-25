import { publicApi } from '../api/publicApi.js';
import {
  getMatchSets as getHistoryMatchSets,
  getMatchWinner as getHistoryMatchWinner,
  getStatsRowsPaired as getHistoryStatsRowsPaired,
} from './history.js';

export function createHistoryView() {
  return {
    history: [],
    expandedMatchStats: {},

    sortedHistory() {
      return [...this.history].sort((a, b) => {
        const ta = a.ended_ts || a.timestamp || '';
        const tb = b.ended_ts || b.timestamp || '';
        return tb.localeCompare(ta);
      });
    },

    async fetchHistory() {
      try {
        const data = await publicApi.getHistory();
        if (!data) return;
        this.history = Array.isArray(data) ? data : [];
        for (const match of this.history) {
          if (match.player_a && match.player_a.includes(' ')) {
            const parts = match.player_a.trim().split(/\s+/);
            const surname = parts[parts.length - 1];
            this.bracketNameMap[surname] = match.player_a;
          }
          if (match.player_b && match.player_b.includes(' ')) {
            const parts = match.player_b.trim().split(/\s+/);
            const surname = parts[parts.length - 1];
            this.bracketNameMap[surname] = match.player_b;
          }
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
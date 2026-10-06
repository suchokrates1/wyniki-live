import { getKnockoutRoundKind } from './bracket.js';
import { resultsByDay } from './resultsModel.js';

// The Alpine side of the results lists (live history and a tournament's results): one template, two sources.

const SIDE_DRAW = /consolation|pocieszeni|\d+\s*[-–]\s*\d+/i;

export function createResultsPanelView() {
  return {
    resultsSource(scope) {
      return (scope === 'tournament' ? this.tournamentHistory : this.history) || [];
    },

    resultsDays(scope) {
      const players = (scope === 'tournament' ? this.tournamentBracket : this.bracketData)?.players || {};
      return resultsByDay(this.filteredHistoryList(this.resultsSource(scope)), players);
    },

    /** A colour per kind of round: medal matches gold, side draws quiet, the main draw blue. */
    resultsPhaseTone(phase) {
      const text = String(phase || '');
      if (!text || /grup|group/i.test(text)) return 'is-group';
      if (SIDE_DRAW.test(text)) return 'is-side';
      const kind = getKnockoutRoundKind(text);
      if (kind === 'final' || /3\.\s*miejsce|3rd/i.test(text)) return 'is-medal';
      return 'is-main';
    },
  };
}

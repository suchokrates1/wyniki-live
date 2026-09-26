import { StatsMode } from '../match-engine/models.js';

const BASIC_ROWS = Object.freeze([
  { key: 'winnersStat', field: 'winners' },
  { key: 'doubleFaults', field: 'doubleFaults' },
  { key: 'firstServePct', kind: 'pct' },
]);

const ADVANCED_ROWS = Object.freeze([
  { key: 'aces', field: 'aces' },
  { key: 'doubleFaults', field: 'doubleFaults' },
  { key: 'winnersStat', field: 'winners' },
  { key: 'unforcedErrors', field: 'unforcedErrors' },
  { key: 'firstServePct', kind: 'pct' },
]);

export function finishStatRows(state) {
  return state?.statsMode === StatsMode.ADVANCED ? ADVANCED_ROWS : BASIC_ROWS;
}

/**
 * The finished match read back as a score, not as the live point columns.
 *
 * The board only has room for two sets and its point column belongs to the game in play,
 * so a match decided in a third set (or a match tiebreak) needs its own line.
 */
export function finalSetsLine(state) {
  if (!state) return '';
  return `${state.player1Sets} : ${state.player2Sets}`;
}

/** "4:1, 1:4, 10:8" — every set in order, a set decided by a tiebreak as "4:3(5)". */
export function finalSetBySetLine(state) {
  return (state?.setsHistory || []).map((set) => {
    const score = `${set.player1Games}:${set.player2Games}`;
    return !set.isSuperTiebreak && set.tiebreakLoserPoints != null
      ? `${score}(${set.tiebreakLoserPoints})`
      : score;
  }).join(', ');
}

export function finishStatValue(state, row) {
  if (!state || !row) return '';
  if (row.kind === 'pct') {
    return `${state.player1Stats.getFirstServePercentage()}% / ${state.player2Stats.getFirstServePercentage()}%`;
  }
  return `${state.player1Stats[row.field]} / ${state.player2Stats[row.field]}`;
}

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

export function finishStatValue(state, row) {
  if (!state || !row) return '';
  if (row.kind === 'pct') {
    return `${state.player1Stats.getFirstServePercentage()}% / ${state.player2Stats.getFirstServePercentage()}%`;
  }
  return `${state.player1Stats[row.field]} / ${state.player2Stats[row.field]}`;
}

export const MatchView = Object.freeze({
  SERVER_SELECTION: 'SERVER_SELECTION',
  BASIC_SCORING: 'BASIC_SCORING',
  SERVE: 'SERVE',
  RALLY: 'RALLY',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  MATCH_FINISHED: 'MATCH_FINISHED',
});

export const SyncStatus = Object.freeze({
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
  OFFLINE: 'OFFLINE',
});

export function matchChrome(state, view, canUndo) {
  const finished = !state || state.isMatchFinished || view === MatchView.MATCH_FINISHED;
  const started = Boolean(state?.matchStartTime);
  return {
    showScoreboard: Boolean(state) && view !== MatchView.SERVER_SELECTION,
    showUndo: !finished,
    showFinish: !finished,
    undoEnabled: Boolean(canUndo) && !finished,
    confirmLeave: started && !finished,
    showTimer: started,
  };
}

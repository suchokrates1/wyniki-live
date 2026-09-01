import { MatchFinishReason, MatchStatus } from '../match-engine/models.js';

const FINISH_REASON_API = {
  [MatchFinishReason.NORMAL]: 'normal',
  [MatchFinishReason.TEST]: 'test',
  [MatchFinishReason.RETIREMENT]: 'retirement',
  [MatchFinishReason.WALKOVER]: 'walkover',
};

const STATUS_API = {
  [MatchStatus.NOT_STARTED]: 'not_started',
  [MatchStatus.IN_PROGRESS]: 'in_progress',
  [MatchStatus.FINISHED]: 'finished',
};

export function toApiFinishReason(reason) {
  return FINISH_REASON_API[reason] || 'normal';
}

export function matchApiStatus(state) {
  if (state.isMatchFinished) return STATUS_API[MatchStatus.FINISHED];
  if (state.matchStartTime > 0) return STATUS_API[MatchStatus.IN_PROGRESS];
  return STATUS_API[MatchStatus.NOT_STARTED];
}

export function toMatchPayload(state) {
  return {
    id: state.matchId || 0,
    court_id: state.courtId,
    player1_name: state.isDoubles ? state.getTeam1FullName() : state.player1.getFullName(),
    player2_name: state.isDoubles ? state.getTeam2FullName() : state.player2.getFullName(),
    match_start_time_ms: state.matchStartTime > 0 ? state.matchStartTime : null,
    score: {
      player1_sets: state.player1Sets,
      player2_sets: state.player2Sets,
      player1_games: state.player1Games,
      player2_games: state.player2Games,
      player1_points: state.player1Points,
      player2_points: state.player2Points,
      sets_history: (state.setsHistory || []).map((set) => ({
        set_number: set.setNumber,
        player1_games: set.player1Games,
        player2_games: set.player2Games,
        tiebreak_loser_points: set.tiebreakLoserPoints,
        is_super_tiebreak: set.isSuperTiebreak,
      })),
    },
    status: matchApiStatus(state),
    schedule_id: state.scheduleId,
    client_match_uuid: state.clientMatchUuid,
    finish_reason: toApiFinishReason(state.finishReason),
    winner_name: state.finishWinnerName,
    injured_player_name: state.injuredPlayerName,
    result_note: state.resultNote,
    match_config: {
      games_per_set: state.matchConfig.gamesPerSet,
      sets_to_win: state.matchConfig.setsToWin,
      tiebreak_points: state.matchConfig.tiebreakPoints,
      super_tiebreak_points: state.matchConfig.superTiebreakPoints,
      no_advantage: state.matchConfig.noAdvantage || state.noAdvantage,
      tiebreak_only: state.matchConfig.tiebreakOnly,
      stats_mode: state.statsMode,
    },
  };
}

export function toFinishPayload(request) {
  return {
    finish_reason: toApiFinishReason(request.finishReason),
    winner_name: request.winnerName ?? null,
    injured_player_name: request.injuredPlayerName ?? null,
    result_note: request.resultNote ?? null,
  };
}

export function toStatisticsPayload(state) {
  if (state.matchId == null || !state.isMatchFinished) return null;
  if (state.finishReason === MatchFinishReason.TEST) return null;
  const winner = state.player1Sets > state.player2Sets
    ? state.player1.getFullName()
    : state.player2Sets > state.player1Sets
      ? state.player2.getFullName()
      : null;
  return {
    match_id: state.matchId,
    player1_name: state.player1.getFullName(),
    player2_name: state.player2.getFullName(),
    player1_stats: playerStatsPayload(state.player1Stats),
    player2_stats: playerStatsPayload(state.player2Stats),
    match_duration_ms: state.matchDuration,
    winner,
    stats_mode: state.statsMode,
  };
}

function playerStatsPayload(stats) {
  return {
    aces: stats.aces,
    double_faults: stats.doubleFaults,
    winners: stats.winners,
    forced_errors: stats.forcedErrors,
    unforced_errors: stats.unforcedErrors,
    first_serves: stats.firstServesTotal,
    first_serves_in: stats.firstServesIn,
    first_serve_percentage: stats.getFirstServePercentage(),
  };
}

export function finishWinnerName(state) {
  if (state.finishWinnerName) return state.finishWinnerName;
  if (state.player1Sets > state.player2Sets) return state.getTeam1DisplayName();
  if (state.player2Sets > state.player1Sets) return state.getTeam2DisplayName();
  return '';
}

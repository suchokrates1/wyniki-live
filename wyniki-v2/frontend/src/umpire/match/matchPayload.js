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

const POINT_EVENT_API = {
  Point: 'point',
  ServeChange: 'serve_change',
  SideChange: 'side_change',
  Game: 'game',
  Set: 'set',
};

export function toApiEventType(event) {
  return POINT_EVENT_API[event] || event;
}

export function toMatchEventPayload(state, eventType, nowMs = Date.now()) {
  return {
    court_id: state.courtId,
    match_id: state.matchId,
    client_match_uuid: state.clientMatchUuid,
    event_type: toApiEventType(eventType),
    player1: eventPlayer(state, true),
    player2: eventPlayer(state, false),
    score: {
      player1_sets: state.player1Sets,
      player2_sets: state.player2Sets,
      player1_games: state.player1Games,
      player2_games: state.player2Games,
      player1_points: state.player1Points,
      player2_points: state.player2Points,
      is_tiebreak: state.isTiebreak,
      is_super_tiebreak: state.isSuperTiebreak,
      match_finished: Boolean(state.isMatchFinished),
      sets_history: (state.setsHistory || []).map((set) => ({
        set_number: set.setNumber,
        player1_games: set.player1Games,
        player2_games: set.player2Games,
        tiebreak_loser_points: set.tiebreakLoserPoints,
        is_super_tiebreak: set.isSuperTiebreak,
      })),
      stats_mode: state.statsMode,
    },
    stats: {
      player1_aces: state.player1Stats.aces,
      player1_double_faults: state.player1Stats.doubleFaults,
      player1_winners: state.player1Stats.winners,
      player1_unforced_errors: state.player1Stats.unforcedErrors,
      player1_first_serve_pct: state.player1Stats.getFirstServePercentage(),
      player2_aces: state.player2Stats.aces,
      player2_double_faults: state.player2Stats.doubleFaults,
      player2_winners: state.player2Stats.winners,
      player2_unforced_errors: state.player2Stats.unforcedErrors,
      player2_first_serve_pct: state.player2Stats.getFirstServePercentage(),
    },
    timestamp: nowMs,
  };
}

function eventPlayer(state, isPlayer1) {
  const player = isPlayer1 ? state.player1 : state.player2;
  const serving = isPlayer1 ? state.isPlayer1Serving : !state.isPlayer1Serving;
  if (!state.isDoubles) {
    return {
      name: player.getDisplayName(),
      full_name: player.getFullName(),
      flag: player.flag || null,
      is_serving: serving,
    };
  }
  return {
    name: isPlayer1 ? state.getTeam1DisplayName() : state.getTeam2DisplayName(),
    full_name: isPlayer1 ? state.getTeam1FullName() : state.getTeam2FullName(),
    flag: player.flag || null,
    is_serving: serving,
  };
}

export function finishWinnerName(state) {
  if (state.finishWinnerName) return state.finishWinnerName;
  if (state.player1Sets > state.player2Sets) return state.getTeam1DisplayName();
  if (state.player2Sets > state.player1Sets) return state.getTeam2DisplayName();
  if (state.player1Games > state.player2Games) return state.getTeam1DisplayName();
  if (state.player2Games > state.player1Games) return state.getTeam2DisplayName();
  return '';
}

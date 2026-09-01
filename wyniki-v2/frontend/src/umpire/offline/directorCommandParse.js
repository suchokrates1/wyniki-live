import { directorCommandDto, directorScoreDto, matchConfigDto } from '../match-engine/directorDtos.js';

export function parseDirectorCommand(raw = {}) {
  return directorCommandDto({
    id: raw.id ?? null,
    seq: raw.seq ?? null,
    type: raw.type ?? null,
    matchId: raw.match_id ?? raw.matchId ?? raw.target_match_id ?? null,
    clientMatchUuid: raw.client_match_uuid ?? raw.clientMatchUuid ?? raw.target_client_match_uuid ?? null,
    courtId: raw.court_id ?? raw.courtId ?? null,
    courtName: raw.court_name ?? raw.courtName ?? null,
    courtToken: raw.court_token ?? raw.courtToken ?? null,
    courtTokenExpiresAt: raw.court_token_expires_at ?? raw.courtTokenExpiresAt ?? null,
    player1Name: raw.player1_name ?? raw.player1Name ?? null,
    player2Name: raw.player2_name ?? raw.player2Name ?? null,
    score: parseDirectorScore(raw.score),
    matchConfig: parseDirectorConfig(raw.match_config ?? raw.matchConfig),
  });
}

function parseDirectorScore(score) {
  if (!score) return null;
  const history = score.sets_history ?? score.setsHistory;
  return directorScoreDto({
    player1Sets: score.player1_sets ?? score.player1Sets,
    player2Sets: score.player2_sets ?? score.player2Sets,
    player1Games: score.player1_games ?? score.player1Games,
    player2Games: score.player2_games ?? score.player2Games,
    player1Points: score.player1_points ?? score.player1Points,
    player2Points: score.player2_points ?? score.player2Points,
    isTiebreak: score.is_tiebreak ?? score.isTiebreak,
    isSuperTiebreak: score.is_super_tiebreak ?? score.isSuperTiebreak,
    isPlayer1Serving: score.is_player1_serving ?? score.isPlayer1Serving,
    setsHistory: Array.isArray(history) ? history.map(parseSetHistory) : null,
  });
}

function parseDirectorConfig(config) {
  if (!config) return null;
  return matchConfigDto({
    gamesPerSet: config.games_per_set ?? config.gamesPerSet,
    setsToWin: config.sets_to_win ?? config.setsToWin,
    tiebreakPoints: config.tiebreak_points ?? config.tiebreakPoints,
    superTiebreakPoints: config.super_tiebreak_points ?? config.superTiebreakPoints,
    noAdvantage: config.no_advantage ?? config.noAdvantage,
    tiebreakOnly: config.tiebreak_only ?? config.tiebreakOnly,
    statsMode: config.stats_mode ?? config.statsMode,
  });
}

function parseSetHistory(set) {
  return {
    setNumber: set.set_number ?? set.setNumber,
    player1Games: set.player1_games ?? set.player1Games,
    player2Games: set.player2_games ?? set.player2Games,
    tiebreakLoserPoints: set.tiebreak_loser_points ?? set.tiebreakLoserPoints ?? null,
    isSuperTiebreak: set.is_super_tiebreak ?? set.isSuperTiebreak ?? false,
  };
}

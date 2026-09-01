import { StatsMode } from './models.js';
import { setScoreDtoToModel } from './directorDtos.js';

export const DirectorCommandApplier = {
  appliesTo(state, command) {
    const matchId = command.matchId;
    if (matchId != null && state.matchId != null && matchId !== state.matchId) {
      return false;
    }
    const uuid = (command.clientMatchUuid ?? '').trim();
    if (uuid.length > 0 && uuid !== state.clientMatchUuid) {
      return false;
    }
    return true;
  },

  apply(state, command) {
    let next = state;
    const courtId = command.courtId?.trim();
    if (courtId) {
      const courtName = command.courtName?.trim();
      next = next.copy({
        courtId,
        courtName: courtName || courtId,
      });
    }
    const player1Name = command.player1Name?.trim();
    if (player1Name) {
      next = next.isDoubles
        ? next.copy({ team1Name: player1Name })
        : next.copy({ player1: renamePlayer(next.player1, player1Name) });
    }
    const player2Name = command.player2Name?.trim();
    if (player2Name) {
      next = next.isDoubles
        ? next.copy({ team2Name: player2Name })
        : next.copy({ player2: renamePlayer(next.player2, player2Name) });
    }
    if (command.matchConfig) {
      const applied = applyConfig(next.matchConfig, command.matchConfig);
      next = next.copy({
        matchConfig: applied,
        noAdvantage: applied.noAdvantage,
      });
      if (command.matchConfig.statsMode) {
        const parsed = parseStatsMode(command.matchConfig.statsMode);
        if (parsed) next.statsMode = parsed;
      }
    }
    if (command.score) {
      const score = command.score;
      if (score.player1Sets != null) next.player1Sets = score.player1Sets;
      if (score.player2Sets != null) next.player2Sets = score.player2Sets;
      if (score.player1Games != null) next.player1Games = score.player1Games;
      if (score.player2Games != null) next.player2Games = score.player2Games;
      if (score.player1Points != null) next.player1Points = score.player1Points;
      if (score.player2Points != null) next.player2Points = score.player2Points;
      if (score.isTiebreak != null) next.isTiebreak = score.isTiebreak;
      if (score.isSuperTiebreak != null) next.isSuperTiebreak = score.isSuperTiebreak;
      if (score.isPlayer1Serving != null) next.isPlayer1Serving = score.isPlayer1Serving;
      if (score.setsHistory != null) {
        next.setsHistory.length = 0;
        next.setsHistory.push(...score.setsHistory.map(setScoreDtoToModel));
      }
    }
    return next;
  },

  renamePlayer,
};

function applyConfig(current, patch) {
  return current.copy({
    gamesPerSet: patch.gamesPerSet ?? current.gamesPerSet,
    setsToWin: patch.setsToWin ?? current.setsToWin,
    tiebreakPoints: patch.tiebreakPoints ?? current.tiebreakPoints,
    superTiebreakPoints: patch.superTiebreakPoints ?? current.superTiebreakPoints,
    noAdvantage: patch.noAdvantage ?? current.noAdvantage,
    tiebreakOnly: patch.tiebreakOnly ?? current.tiebreakOnly,
    statsMode: parseStatsMode(patch.statsMode) ?? current.statsMode,
  });
}

function parseStatsMode(mode) {
  if (mode == null) return null;
  const key = String(mode).toUpperCase();
  return StatsMode[key] ?? null;
}

export function renamePlayer(player, fullName) {
  const parts = fullName.trim().split(/\s+/, 2);
  const first = parts[0] ?? '';
  const last = parts[1] ?? '';
  return player.copy({
    name: fullName.trim(),
    firstName: first,
    lastName: last || first,
  });
}

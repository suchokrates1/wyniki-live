import { MatchConfig, MatchState } from '../match-engine/models.js';
import { Player } from '../match-engine/player.js';

export function playerFromDraft(player) {
  if (!player) return null;
  return new Player({
    id: player.id,
    name: player.name || player.full_name || player.fullName || '',
    firstName: player.firstName || player.first_name || '',
    lastName: player.lastName || player.last_name || player.surname || '',
    flag: player.flag || player.country_code || null,
    gender: player.gender || null,
  });
}

export function createMatchFromDraft(draft) {
  if (!draft?.players?.length) {
    throw new Error('Match draft has no players');
  }
  const players = draft.players.map(playerFromDraft);
  const config = new MatchConfig(draft.matchConfig || {});
  const isDoubles = Boolean(draft.isDoubles);
  const state = new MatchState({
    player1: players[0],
    player2: players[1],
    player3: isDoubles ? (players[2] || null) : null,
    player4: isDoubles ? (players[3] || null) : null,
    courtId: draft.courtId,
    courtName: draft.courtName,
    scheduleId: draft.scheduleId ?? null,
    isDoubles,
    isMixedDoubles: Boolean(draft.isMixedDoubles),
    team1Name: draft.team1Name || null,
    team2Name: draft.team2Name || null,
    umpireName: draft.umpireName || null,
    manualStartTime: draft.manualStartTime ?? null,
    currentServer: 1,
    statsMode: config.statsMode,
    noAdvantage: config.noAdvantage,
    matchConfig: config,
  });
  if (config.tiebreakOnly) state.isSuperTiebreak = true;
  return state;
}

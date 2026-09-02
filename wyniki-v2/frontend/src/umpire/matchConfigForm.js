import { MatchConfig, StatsMode } from './match-engine/models.js';

export const DEFAULT_MATCH_CONFIG_FORM = Object.freeze({
  gamesPerSet: 4,
  setsToWin: 2,
  tiebreakPoints: 7,
  superTiebreakPoints: 10,
  tbOnlyPoints: 10,
  noAdvantage: false,
  tiebreakOnly: false,
  umpireName: '',
  manualStartTime: null,
  advancedStats: false,
});

export function buildMatchConfig(form, statsMode) {
  if (form.tiebreakOnly) {
    return new MatchConfig({
      setsToWin: 1,
      superTiebreakPoints: form.tbOnlyPoints === 7 ? 7 : 10,
      statsMode,
      noAdvantage: Boolean(form.noAdvantage),
      tiebreakOnly: true,
    });
  }

  const gamesPerSet = [3, 4, 5, 6].includes(form.gamesPerSet) ? form.gamesPerSet : 4;
  const setsToWin = [1, 2, 3].includes(form.setsToWin) ? form.setsToWin : 2;
  return new MatchConfig({
    gamesPerSet,
    setsToWin,
    tiebreakPoints: form.tiebreakPoints === 10 ? 10 : 7,
    superTiebreakPoints: form.superTiebreakPoints === 7 ? 7 : 10,
    statsMode,
    noAdvantage: Boolean(form.noAdvantage),
  });
}

export function startDraft({
  selectedPlayers,
  isDoubles,
  isMixedDoubles,
  team1Name,
  team2Name,
  courtId,
  courtName,
  scheduleId,
  config,
  umpireName,
  manualStartTime,
}) {
  const mapped = (isDoubles && selectedPlayers.length === 4)
    ? [selectedPlayers[0], selectedPlayers[2], selectedPlayers[1], selectedPlayers[3]]
    : selectedPlayers;
  const players = mapped.map((player) => ({
    id: player.id,
    name: player.name || player.full_name || player.fullName,
    firstName: player.firstName || player.first_name || '',
    lastName: player.lastName || player.last_name || player.surname || '',
    flag: player.flag || player.country_code || null,
    gender: player.gender || null,
  }));

  return {
    courtId,
    courtName,
    scheduleId: scheduleId ?? null,
    isDoubles: Boolean(isDoubles),
    isMixedDoubles: Boolean(isMixedDoubles),
    team1Name: team1Name || null,
    team2Name: team2Name || null,
    umpireName: umpireName?.trim() || null,
    manualStartTime: manualStartTime ?? null,
    statsMode: config.statsMode,
    noAdvantage: config.noAdvantage,
    matchConfig: {
      gamesPerSet: config.gamesPerSet,
      setsToWin: config.setsToWin,
      tiebreakPoints: config.tiebreakPoints,
      superTiebreakPoints: config.superTiebreakPoints,
      statsMode: config.statsMode,
      noAdvantage: config.noAdvantage,
      tiebreakOnly: config.tiebreakOnly,
    },
    players,
    startInSuperTiebreak: Boolean(config.tiebreakOnly),
  };
}

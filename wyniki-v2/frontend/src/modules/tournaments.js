export function getTournamentOpenState(tournamentId, historySubTab = 'bracket') {
  return {
    selectedTournamentId: String(tournamentId),
    historySubTab,
  };
}

export function getClearedTournamentDetailState() {
  return {
    tournamentHistory: [],
    tournamentBracket: null,
    tournamentSchedule: null,
  };
}

export function getSelectedTournamentName(tournaments = [], selectedTournamentId = '', tournamentBracket = null) {
  const tournament = (Array.isArray(tournaments) ? tournaments : []).find((entry) => String(entry.id) === String(selectedTournamentId));
  return tournament ? tournament.name : (tournamentBracket?.tournament?.name || '');
}

export function buildTournamentAccessQuery({ accessKey = '', simulationStage = '' } = {}) {
  const params = new URLSearchParams();
  if (accessKey) params.set('access_key', accessKey);
  if (simulationStage) params.set('etap', simulationStage);
  const query = params.toString();
  return query ? `?${query}` : '';
}
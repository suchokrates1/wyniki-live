export function withNoCacheQuery(path, existingQuery = '') {
  const params = new URLSearchParams(String(existingQuery || '').replace(/^\?/, ''));
  params.set('_', Date.now().toString());
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

async function fetchJson(path, existingQuery = '', { errorMessage = '' } = {}) {
  const response = await fetch(withNoCacheQuery(path, existingQuery), { cache: 'no-store' });
  if (!response.ok) {
    if (errorMessage) throw new Error(errorMessage);
    return null;
  }
  return response.json();
}

export const publicApi = {
  getSnapshot() {
    return fetchJson('/api/snapshot', '', { errorMessage: 'Failed to fetch courts' });
  },

  getHistory() {
    return fetchJson('/api/history');
  },

  getTournaments() {
    return fetchJson('/api/tournament/list');
  },

  getTournamentHistory(tournamentId, accessQuery = '') {
    return fetchJson(`/api/tournament/${encodeURIComponent(tournamentId)}/history`, accessQuery);
  },

  getTournamentBracket(tournamentId, accessQuery = '') {
    return fetchJson(`/api/tournament/${encodeURIComponent(tournamentId)}/bracket`, accessQuery);
  },

  getTournamentSchedule(tournamentId, accessQuery = '') {
    return fetchJson(`/api/tournament/${encodeURIComponent(tournamentId)}/schedule`, accessQuery);
  },

  getActiveBracket() {
    return fetchJson('/api/tournament/bracket');
  },

  getActiveSchedule() {
    return fetchJson('/api/tournament/schedule');
  },

  getAllPlayers() {
    return fetchJson('/api/players/all');
  },

  getPlayerProfile(playerId, isGlobal = false) {
    const query = isGlobal ? '?global=1' : '';
    return fetchJson(`/api/players/${encodeURIComponent(playerId)}/profile`, query);
  },

  getMatchStats(matchId) {
    return fetchJson(`/api/match-stats/${matchId}`);
  },
};
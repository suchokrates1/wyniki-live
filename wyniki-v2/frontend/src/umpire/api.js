export function createUmpireApi({ fetchImpl = fetch, getToken = () => null } = {}) {
  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const token = getToken();
    const skipAuth = String(path).includes('/authorize');
    if (token && !skipAuth) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(path, { ...options, headers });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  }

  return {
    getActiveTournaments() {
      return request('/api/tournaments/active');
    },

    getCourts(tournamentId) {
      const query = tournamentId != null ? `?tournament_id=${encodeURIComponent(tournamentId)}` : '';
      return request(`/api/courts${query}`);
    },

    authorizeCourt(courtId, pin) {
      return request(`/api/courts/${encodeURIComponent(courtId)}/authorize`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
    },

    getPlayers(courtId) {
      const query = courtId ? `?court_id=${encodeURIComponent(courtId)}` : '';
      return request(`/api/players${query}`);
    },

    addPlayer(payload) {
      return request('/api/players', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    createMatch(payload) {
      return request('/api/matches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    updateMatch(matchId, payload) {
      return request(`/api/matches/${encodeURIComponent(matchId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },

    finishMatch(matchId, payload) {
      return request(`/api/matches/${encodeURIComponent(matchId)}/finish`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    sendStatistics(payload) {
      return request('/api/match-statistics', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    logMatchEvent(payload) {
      return request('/api/match-events', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    getSuggestedMatch(courtId, tournamentId) {
      const params = new URLSearchParams();
      if (tournamentId != null) params.set('tournament_id', String(tournamentId));
      const query = params.toString() ? `?${params}` : '';
      return request(`/api/courts/${encodeURIComponent(courtId)}/suggested-match${query}`);
    },
  };
}

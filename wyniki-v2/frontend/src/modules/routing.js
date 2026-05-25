export function applyHashRoute(app, rawHash = location.hash) {
  const hash = decodeURIComponent(String(rawHash || '').replace(/^#/, ''));
  if (!hash) {
    app.activeTab = 'live';
    app.liveSubTab = 'scores';
    app.selectedTournamentId = '';
    app.selectedPlayerId = null;
    app._profileIsGlobal = false;
    app.playerProfile = null;
    app.fetchInitialData();
    return;
  }

  app._navigating = true;
  const parts = hash.split('/');
  const tab = parts[0];

  if (tab === 'bracket' || tab === 'drabinka') {
    app.activeTab = 'live';
    app.liveSubTab = 'bracket';
    app.selectedPlayerId = null;
    app.selectedTournamentId = '';
    app.fetchBracket();
    if (parts[1]) app._pendingCategory = parts.slice(1).join('/');
  } else if (tab === 'tournaments' || tab === 'history' || tab === 'historia') {
    app.activeTab = 'tournaments';
    app.selectedPlayerId = null;
    app.fetchTournaments();
    if (parts[1]) {
      app.selectedTournamentId = parts[1];
      if (parts[2] === 'matches') app.historySubTab = 'matches';
      else if (parts[2] === 'schedule') app.historySubTab = 'schedule';
      else app.historySubTab = 'bracket';
      app.onTournamentSelected();
    } else {
      app.selectedTournamentId = '';
    }
  } else if (tab === 'players' || tab === 'zawodnicy') {
    app.activeTab = 'players';
    app.selectedTournamentId = '';
    if (parts[1]) {
      let mode = 'auto';
      let idPart = parts[1];
      if (parts[1] === 'global' || parts[1] === 'local') {
        mode = parts[1];
        idPart = parts[2];
      }
      const playerId = parseInt(idPart, 10);
      if (Number.isFinite(playerId)) {
        app.selectedPlayerId = playerId;
        app._profileIsGlobal = mode === 'global';
        app.playerProfile = null;
        app.profileExpandedTournaments = {};
        app.fetchPlayerProfile(playerId, mode);
      } else {
        app.selectedPlayerId = null;
        app._profileIsGlobal = false;
        app.playerProfile = null;
        app.fetchAllPlayers();
      }
    } else {
      app.selectedPlayerId = null;
      app._profileIsGlobal = false;
      app.playerProfile = null;
      app.fetchAllPlayers();
    }
  } else if (tab === 'live') {
    app.activeTab = 'live';
    app.selectedPlayerId = null;
    app.selectedTournamentId = '';
    if (parts[1]) app.liveSubTab = parts[1];
    else app.liveSubTab = 'scores';
    if (app.liveSubTab === 'bracket') app.fetchBracket();
    else if (app.liveSubTab === 'schedule') app.fetchSchedule();
    else if (app.liveSubTab === 'history') app.fetchHistory();
    else app.fetchInitialData();
  }

  app._navigating = false;
}

export function buildHashFromState(app) {
  if (app.activeTab === 'live' && app.liveSubTab !== 'scores') {
    return `live/${app.liveSubTab}`;
  }

  if (app.activeTab === 'tournaments' && app.selectedTournamentId) {
    return `tournaments/${app.selectedTournamentId}/${app.historySubTab}`;
  }

  if (app.activeTab === 'players' && app.selectedPlayerId) {
    const mode = app._profileIsGlobal ? 'global/' : 'local/';
    return `players/${mode}${app.selectedPlayerId}`;
  }

  return app.activeTab;
}

export function updateHashFromState(app, replace = false) {
  if (app._navigating) return;
  const encoded = `#${encodeURIComponent(buildHashFromState(app))}`;
  if (location.hash === encoded) return;

  if (replace) {
    history.replaceState(null, '', encoded);
  } else {
    history.pushState(null, '', encoded);
  }
}
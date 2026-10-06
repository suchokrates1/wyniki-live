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
  // "tournaments/31/bracket/B1 Men?pin=Jani Kallunki": the category and a pinned player ride along
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/');
  const tab = parts[0];
  const bracketRoute = tab === 'bracket' || tab === 'drabinka' || (tab === 'live' && parts[1] === 'bracket')
    || ((tab === 'tournaments' || tab === 'history' || tab === 'historia') && parts[1] && (!parts[2] || parts[2] === 'bracket'));
  if (bracketRoute) app.bracketPinName = new URLSearchParams(query).get('pin') || '';

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
      else {
        app.historySubTab = 'bracket';
        if (parts[3]) app._pendingTournamentCategory = parts.slice(3).join('/');
      }
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
    if (app.liveSubTab === 'bracket' && parts[2]) app._pendingCategory = parts.slice(2).join('/');
    if (app.liveSubTab === 'bracket') app.fetchBracket();
    else if (app.liveSubTab === 'schedule') app.fetchSchedule();
    else if (app.liveSubTab === 'history') app.fetchHistory();
    else app.fetchInitialData();
  }

  app._navigating = false;
}

function bracketSuffix(category, pin) {
  return `${category ? `/${category}` : ''}${pin ? `?pin=${pin}` : ''}`;
}

export function buildHashFromState(app) {
  if (app.activeTab === 'live' && app.liveSubTab === 'bracket') {
    return `live/bracket${bracketSuffix(app.bracketCategory, app.bracketPinName)}`;
  }

  if (app.activeTab === 'live' && app.liveSubTab !== 'scores') {
    return `live/${app.liveSubTab}`;
  }

  if (app.activeTab === 'tournaments' && app.selectedTournamentId) {
    const base = `tournaments/${app.selectedTournamentId}/${app.historySubTab}`;
    return app.historySubTab === 'bracket' ? `${base}${bracketSuffix(app.tournamentBracketCategory, app.bracketPinName)}` : base;
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
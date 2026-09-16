const TENNIS = ['0', '15', '30', '40'];

export function tennisPoints(rawA = 0, rawB = 0, { isTiebreak = false, isSuperTiebreak = false } = {}) {
  const a = Number(rawA) || 0;
  const b = Number(rawB) || 0;
  if (isTiebreak || isSuperTiebreak) return `${a}:${b}`;
  if (a <= 3 && b <= 3 && !(a === 3 && b === 3)) return `${TENNIS[a]}:${TENNIS[b]}`;
  if (a === b) return '40:40';
  if (a > b) return 'ADV:40';
  return '40:ADV';
}

export function formatClock(snapshot, nowMs = Date.now()) {
  const duration = Number(snapshot?.match_duration_ms) || 0;
  const start = Number(snapshot?.match_start_time_ms) || 0;
  const elapsed = duration > 0 && !start ? duration : start > 0 ? Math.max(0, nowMs - start) : 0;
  const total = Math.floor(elapsed / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatScoreLine(snapshot = {}) {
  const history = Array.isArray(snapshot.sets_history) ? snapshot.sets_history : [];
  const sets = history
    .filter((set) => !set.is_super_tiebreak)
    .map((set) => `${set.player1_games ?? 0}:${set.player2_games ?? 0}`);
  const games = `${snapshot.player1_games ?? 0}:${snapshot.player2_games ?? 0}`;
  const points = tennisPoints(snapshot.player1_points, snapshot.player2_points, snapshot);
  const bits = [];
  if (sets.length) bits.push(sets.join(' '));
  bits.push(`gemy ${games}`);
  bits.push(snapshot.is_tiebreak || snapshot.is_super_tiebreak ? `TB ${points}` : points);
  return bits.join(' · ');
}

export function formatSeenAgo(lastSeen, nowMs = Date.now()) {
  if (!lastSeen) return '';
  const then = Date.parse(lastSeen);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < 5) return 'przed chwilą';
  if (seconds < 60) return `${seconds} s temu`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min temu`;
  return `${Math.round(minutes / 60)} h temu`;
}

export function directorDeviceCard(tablet, nowMs = Date.now()) {
  if (!tablet) return null;
  const snapshot = tablet.snapshot || null;
  const ago = formatSeenAgo(tablet.last_seen, nowMs);
  if (!snapshot) {
    return {
      title: 'Brak stanu z tabletu',
      source: tablet.from_db
        ? 'To wiersz z bazy — bez punktów bieżącego gema.'
        : (ago ? `Ostatni sygnał ${ago}, ale bez wyniku z urządzenia.` : 'Tablet nie przysłał jeszcze wyniku.'),
      court: tablet.session_court_id || '',
      clock: '',
      names: [tablet.player1_name, tablet.player2_name].filter(Boolean).join(' vs ') || '—',
      score: '',
      rules: '',
      fresh: false,
    };
  }
  const courtLabel = snapshot.court_name || snapshot.court_id || tablet.session_court_id || '';
  const courtId = snapshot.court_id || tablet.session_court_id || '';
  const serve = snapshot.is_player1_serving == null
    ? ''
    : (snapshot.is_player1_serving ? 'serwuje strona 1' : 'serwuje strona 2');
  const rules = [
    snapshot.games_per_set ? `${snapshot.games_per_set} gemy` : null,
    snapshot.sets_to_win ? `${snapshot.sets_to_win} sety do wygranej` : null,
    snapshot.no_advantage ? 'No-Ad' : null,
    snapshot.tiebreak_only ? 'tylko TB' : null,
  ].filter(Boolean).join(' · ');
  return {
    title: 'Na tablecie teraz',
    source: ago ? `Z urządzenia${tablet.platform ? ` (${tablet.platform})` : ''}, ${ago}` : 'Z urządzenia',
    court: courtId && courtLabel && courtLabel !== courtId ? `${courtLabel} (${courtId})` : (courtLabel || courtId),
    clock: formatClock(snapshot, nowMs),
    names: `${snapshot.player1_name || tablet.player1_name || '?'} vs ${snapshot.player2_name || tablet.player2_name || '?'}`,
    score: [formatScoreLine(snapshot), serve].filter(Boolean).join(' · '),
    rules,
    fresh: true,
  };
}

export function playerDisplayName(player = {}) {
  const full = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  return full || player.name || '';
}

export function tournamentIdFromCourtId(courtId) {
  const match = String(courtId || '').trim().match(/^t(\d+)(?:-|$)/i);
  return match ? Number(match[1]) : null;
}

export function asPlayerList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.players)) return payload.players;
  return [];
}

export function filterTournamentPlayers(players = [], query = '') {
  const rows = [...players].sort((a, b) =>
    playerDisplayName(a).localeCompare(playerDisplayName(b), 'pl', { sensitivity: 'base' })
  );
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((player) => {
    const hay = [
      playerDisplayName(player),
      player.name,
      player.first_name,
      player.last_name,
      player.category,
      player.country,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function applyTabletToDirectorForm(tablet = {}) {
  const snapshot = tablet.snapshot || {};
  return {
    sessionCourtId: tablet.session_court_id || snapshot.court_id || '',
    matchId: tablet.match_id || null,
    courtId: snapshot.court_id || tablet.session_court_id || '',
    player1Name: snapshot.player1_name || tablet.player1_name || '',
    player2Name: snapshot.player2_name || tablet.player2_name || '',
    player1Sets: snapshot.player1_sets ?? 0,
    player2Sets: snapshot.player2_sets ?? 0,
    player1Games: snapshot.player1_games ?? 0,
    player2Games: snapshot.player2_games ?? 0,
    player1Points: snapshot.player1_points ?? 0,
    player2Points: snapshot.player2_points ?? 0,
    gamesPerSet: snapshot.games_per_set || 4,
    setsToWin: snapshot.sets_to_win || 2,
    noAdvantage: !!snapshot.no_advantage,
    tiebreakOnly: !!snapshot.tiebreak_only,
    statsMode: snapshot.stats_mode || 'ADVANCED',
  };
}

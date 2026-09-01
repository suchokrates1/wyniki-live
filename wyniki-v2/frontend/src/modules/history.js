import { competitorSearchTokens, lastNameToken } from '../shared/teamDisplay.js';

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isPlaceholderSuperTieBreak(left, right) {
  return Math.max(left, right) <= 1;
}

function looksLikeSuperTieBreak(completedSets, left, right, setInfo) {
  if (setInfo?.is_super_tiebreak) return true;
  if (completedSets.length !== 2) return false;
  const first = completedSets[0];
  const second = completedSets[1];
  const split = (first.a > first.b) !== (second.a > second.b);
  if (!split) return false;
  // Match STB is first to 10; a 7-6 third set is a regular set with TB.
  return Math.max(left, right) >= 10;
}

function resolveSuperTieBreakPoints(left, right, tieBreak) {
  if (tieBreak === null || tieBreak === undefined) return { left, right };
  if (!isPlaceholderSuperTieBreak(left, right)) return { left, right };
  const loserPoints = asInt(tieBreak);
  const winnerPoints = Math.max(10, loserPoints + 2);
  if (left > right) return { left: winnerPoints, right: loserPoints };
  return { left: loserPoints, right: winnerPoints };
}

function buildSet(left, right, tieBreak, isSuperTieBreak) {
  let resolvedLeft = left;
  let resolvedRight = right;
  if (isSuperTieBreak) {
    ({ left: resolvedLeft, right: resolvedRight } = resolveSuperTieBreakPoints(left, right, tieBreak));
  }
  return {
    a: resolvedLeft,
    b: resolvedRight,
    tb: isSuperTieBreak ? null : (tieBreak ?? null),
    isSuperTB: !!isSuperTieBreak,
  };
}

function setsFromHistory(setsHistory) {
  if (!Array.isArray(setsHistory) || !setsHistory.length) return [];
  const sets = [];
  for (const setInfo of setsHistory) {
    if (!setInfo || typeof setInfo !== 'object') continue;
    const left = asInt(setInfo.player1_games);
    const right = asInt(setInfo.player2_games);
    const tieBreak = setInfo.tiebreak_loser_points ?? null;
    const isSuperTieBreak = looksLikeSuperTieBreak(sets, left, right, setInfo);
    if (left === 0 && right === 0 && tieBreak == null && !isSuperTieBreak) continue;
    sets.push(buildSet(left, right, tieBreak, isSuperTieBreak));
  }
  return sets;
}

function setsFromScoreArrays(scoreA, scoreB, setsHistory) {
  if (!scoreA || !scoreB) return [];
  const sets = [];
  const numSets = Math.max(scoreA.length, scoreB.length);
  for (let index = 0; index < numSets; index += 1) {
    const left = asInt(scoreA[index]);
    const right = asInt(scoreB[index]);
    if (left === 0 && right === 0 && index > 0) continue;
    const setInfo = setsHistory?.find((set) => asInt(set?.set_number, -1) === index + 1);
    const tieBreak = setInfo?.tiebreak_loser_points ?? null;
    const isSuperTieBreak = looksLikeSuperTieBreak(sets, left, right, setInfo);
    sets.push(buildSet(left, right, tieBreak, isSuperTieBreak));
  }
  return sets;
}

export function getMatchSets(match) {
  const fromHistory = setsFromHistory(match?.sets_history);
  if (fromHistory.length) return fromHistory;
  return setsFromScoreArrays(match?.score_a, match?.score_b, match?.sets_history);
}

export function formatHistoryScore(scoreA, scoreB, setsHistory) {
  const sets = getMatchSets({ score_a: scoreA, score_b: scoreB, sets_history: setsHistory });
  if (!sets.length) return '–';
  return sets.map((set) => {
    if (set.isSuperTB) return `[${set.a}:${set.b}]`;
    if (set.tb != null && set.tb >= 0) {
      const winnerTieBreak = Math.max(7, asInt(set.tb) + 2);
      const tieBreakLeft = set.a > set.b ? winnerTieBreak : set.tb;
      const tieBreakRight = set.a > set.b ? set.tb : winnerTieBreak;
      return `${set.a}:${set.b}(${tieBreakLeft}:${tieBreakRight})`;
    }
    return `${set.a}:${set.b}`;
  }).join(', ') || '–';
}

export function getMatchWinner(match) {
  const sets = getMatchSets(match);
  let setsA = 0;
  let setsB = 0;
  for (const set of sets) {
    if (set.a > set.b) setsA += 1;
    else if (set.b > set.a) setsB += 1;
  }
  if (setsA > setsB) return 'A';
  if (setsB > setsA) return 'B';
  if (match?.winner_name) {
    if (match.winner_name === match.player_a) return 'A';
    if (match.winner_name === match.player_b) return 'B';
  }
  return null;
}

function numericValue(value) {
  return typeof value === 'string' ? parseFloat(value) : value;
}

function firstServePercentage(stats) {
  if (stats.first_serve_percentage != null) return `${Math.round(stats.first_serve_percentage)}%`;
  if (stats.first_serves > 0) return `${Math.round(((stats.first_serves_in ?? 0) / stats.first_serves) * 100)}%`;
  return '–';
}

export function getStatsRowsPaired(stats, labels = {}) {
  if (!stats || !stats.player1_stats) return [];
  const player1 = stats.player1_stats;
  const player2 = stats.player2_stats || {};
  const mode = (stats.stats_mode || 'ADVANCED').toUpperCase();
  const rows = [];

  const push = (label, p1, p2, lowerIsBetter = false) => {
    const n1 = numericValue(p1);
    const n2 = numericValue(p2);
    const cmp = lowerIsBetter ? -1 : 1;
    rows.push({
      label,
      p1,
      p2,
      p1Better: !isNaN(n1) && !isNaN(n2) && (n1 - n2) * cmp > 0,
      p2Better: !isNaN(n1) && !isNaN(n2) && (n2 - n1) * cmp > 0,
    });
  };

  if (mode === 'ADVANCED') push(labels.aces || 'Aces', player1.aces ?? 0, player2.aces ?? 0);
  push(labels.doubleFaults || 'Double faults', player1.double_faults ?? 0, player2.double_faults ?? 0, true);
  push(labels.winners || 'Winners', player1.winners ?? 0, player2.winners ?? 0);
  if (mode === 'ADVANCED') {
    push(labels.forcedErrors || 'Forced errors', player1.forced_errors ?? 0, player2.forced_errors ?? 0, true);
    push(labels.unforcedErrors || 'Unforced errors', player1.unforced_errors ?? 0, player2.unforced_errors ?? 0, true);
  }
  if (player1.first_serves > 0 || player1.first_serve_percentage > 0) {
    if (mode === 'ADVANCED' && player1.first_serves > 0) {
      push(labels.firstServe || '1st serve', `${player1.first_serves_in ?? 0}/${player1.first_serves}`, `${player2.first_serves_in ?? 0}/${player2.first_serves || 0}`);
    }
    push(labels.firstServePct || '1st serve %', firstServePercentage(player1), firstServePercentage(player2));
  }
  if (mode === 'ADVANCED') {
    const p1Won = (player1.aces ?? 0) + (player1.winners ?? 0) + (player2.double_faults ?? 0) + (player2.forced_errors ?? 0) + (player2.unforced_errors ?? 0);
    const p2Won = (player2.aces ?? 0) + (player2.winners ?? 0) + (player1.double_faults ?? 0) + (player1.forced_errors ?? 0) + (player1.unforced_errors ?? 0);
    push(labels.pointsWon || 'Points won', p1Won, p2Won);
  }

  return rows;
}

export function getStatsRows(stats, playerKey, otherPlayerKey, labels = {}) {
  if (!stats || !stats[playerKey]) return [];
  const player = stats[playerKey];
  const opponent = stats[otherPlayerKey] || {};
  const mode = (stats.stats_mode || 'ADVANCED').toUpperCase();
  const rows = [];

  if (mode === 'ADVANCED') rows.push({ label: labels.aces || 'Aces', value: player.aces ?? 0 });
  rows.push({ label: labels.doubleFaults || 'Double faults', value: player.double_faults ?? 0 });
  rows.push({ label: labels.winners || 'Winners', value: player.winners ?? 0 });
  if (mode === 'ADVANCED') {
    rows.push({ label: labels.forcedErrors || 'Forced errors', value: player.forced_errors ?? 0 });
    rows.push({ label: labels.unforcedErrors || 'Unforced errors', value: player.unforced_errors ?? 0 });
  }
  if (player.first_serves > 0 || player.first_serve_percentage > 0) {
    if (mode === 'ADVANCED' && player.first_serves > 0) {
      rows.push({ label: labels.firstServe || '1st serve', value: `${player.first_serves_in ?? 0}/${player.first_serves}` });
    }
    rows.push({ label: labels.firstServePct || '1st serve %', value: firstServePercentage(player) });
  }
  if (mode === 'ADVANCED') {
    const pointsWon = (player.aces ?? 0) + (player.winners ?? 0) + (opponent.double_faults ?? 0) + (opponent.forced_errors ?? 0) + (opponent.unforced_errors ?? 0);
    rows.push({ label: labels.pointsWon || 'Points won', value: pointsWon });
  }

  return rows;
}

export function matchEndedDateKey(match) {
  const raw = match?.ended_ts || match?.timestamp || match?.started_at || '';
  const matchDate = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return matchDate ? matchDate[1] : '';
}

export function matchCourtKey(match) {
  return String(match?.kort_id || match?.court_name || '').trim();
}

function historySearchHaystack(match) {
  const names = [match?.player_a, match?.player_b]
    .flatMap((name) => competitorSearchTokens(name))
    .concat([lastNameToken(match?.player_a), lastNameToken(match?.player_b)]);
  return [
    ...names,
    match?.category,
    match?.phase,
    match?.kort_id,
    match?.court_name,
    match?.winner_name,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function filterMatchHistory(matches = [], { search = '', category = '', court = '', date = '' } = {}) {
  const needle = String(search || '').trim().toLowerCase();
  return (matches || []).filter((match) => {
    if (category && String(match?.category || '') !== String(category)) return false;
    if (court && matchCourtKey(match) !== String(court)) return false;
    if (date && matchEndedDateKey(match) !== String(date)) return false;
    if (needle && !historySearchHaystack(match).includes(needle)) return false;
    return true;
  });
}

export function historyFilterOptions(matches = []) {
  const categories = [];
  const courts = [];
  const dates = [];
  const seen = { category: new Set(), court: new Set(), date: new Set() };
  for (const match of matches || []) {
    const category = String(match?.category || '').trim();
    if (category && !seen.category.has(category)) {
      seen.category.add(category);
      categories.push(category);
    }
    const court = matchCourtKey(match);
    if (court && !seen.court.has(court)) {
      seen.court.add(court);
      courts.push({
        value: court,
        label: String(match?.court_name || court).trim() || court,
      });
    }
    const date = matchEndedDateKey(match);
    if (date && !seen.date.has(date)) {
      seen.date.add(date);
      dates.push(date);
    }
  }
  courts.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
  dates.sort((left, right) => right.localeCompare(left));
  return { categories, courts, dates };
}

export function formatHistoryScore(scoreA, scoreB, setsHistory) {
  if (!scoreA || !scoreB) return '–';
  const parts = [];
  const numSets = Math.max(scoreA.length, scoreB.length);
  for (let index = 0; index < numSets; index += 1) {
    let left = scoreA[index] ?? 0;
    let right = scoreB[index] ?? 0;
    if (left === 0 && right === 0 && index > 0) continue;

    const setInfo = setsHistory?.find((set) => set.set_number === index + 1);
    const tieBreakLoser = setInfo?.tiebreak_loser_points;
    const isSuperTieBreak = setInfo?.is_super_tiebreak || (index === 2 && parts.length === 2 && Math.abs(left - right) <= 1);

    if (isSuperTieBreak && tieBreakLoser != null) {
      const winnerPoints = Math.max(10, tieBreakLoser + 2);
      if (left > right) {
        left = winnerPoints;
        right = tieBreakLoser;
      } else {
        left = tieBreakLoser;
        right = winnerPoints;
      }
      parts.push(`[${left}:${right}]`);
    } else if (tieBreakLoser != null && tieBreakLoser >= 0) {
      const winnerTieBreak = Math.max(7, tieBreakLoser + 2);
      const tieBreakLeft = left > right ? winnerTieBreak : tieBreakLoser;
      const tieBreakRight = left > right ? tieBreakLoser : winnerTieBreak;
      parts.push(`${left}:${right}(${tieBreakLeft}:${tieBreakRight})`);
    } else {
      parts.push(`${left}:${right}`);
    }
  }
  return parts.join(', ') || '–';
}

export function getMatchWinner(match) {
  if (!match?.score_a || !match?.score_b) return null;
  let setsA = 0;
  let setsB = 0;
  for (let index = 0; index < Math.max(match.score_a.length, match.score_b.length); index += 1) {
    const left = match.score_a[index] ?? 0;
    const right = match.score_b[index] ?? 0;
    if (left === 0 && right === 0 && index > 0) continue;
    if (left > right) setsA += 1;
    else if (right > left) setsB += 1;
  }
  if (setsA > setsB) return 'A';
  if (setsB > setsA) return 'B';
  return null;
}

export function getMatchSets(match) {
  if (!match?.score_a || !match?.score_b) return [];
  const sets = [];
  const numSets = Math.max(match.score_a.length, match.score_b.length);
  for (let index = 0; index < numSets; index += 1) {
    let left = match.score_a[index] ?? 0;
    let right = match.score_b[index] ?? 0;
    if (left === 0 && right === 0 && index > 0) continue;
    const setInfo = match.sets_history?.find((set) => set.set_number === index + 1);
    const tieBreak = setInfo?.tiebreak_loser_points ?? null;
    const isSuperTieBreak = setInfo?.is_super_tiebreak || (index === 2 && sets.length === 2 && Math.abs(left - right) <= 1);
    if (isSuperTieBreak && tieBreak !== null && tieBreak !== undefined) {
      const winnerPoints = Math.max(10, tieBreak + 2);
      if (left > right) {
        left = winnerPoints;
        right = tieBreak;
      } else {
        left = tieBreak;
        right = winnerPoints;
      }
    }
    sets.push({ a: left, b: right, tb: isSuperTieBreak ? null : tieBreak, isSuperTB: isSuperTieBreak });
  }
  return sets;
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
export function computeTieVisibility(tieState) {
  if (!tieState || typeof tieState !== 'object') return false;
  const rawA = parseInt(tieState.A ?? tieState.a ?? 0, 10);
  const rawB = parseInt(tieState.B ?? tieState.b ?? 0, 10);
  return (isNaN(rawA) ? 0 : rawA) !== 0 || (isNaN(rawB) ? 0 : rawB) !== 0;
}

export function resolveDisplayPoints(court, side) {
  if (!court) return '0';
  const tie = court.tie || {};
  if (computeTieVisibility(tie)) {
    const raw = tie[side] ?? tie[String(side).toLowerCase()];
    return raw !== undefined && raw !== null ? String(raw) : '0';
  }
  const points = court[side]?.points;
  return points !== undefined && points !== null ? String(points) : '0';
}

export function getStoredSetScore(court, side, setIdx) {
  if (!court) return 0;
  const active = court.match_status?.active;
  const currentSet = parseInt(court.current_set, 10) || 1;
  const hasSetDetail = Array.isArray(court.sets_detail) && court.sets_detail.length > 0;
  if (active && !hasSetDetail && setIdx > currentSet) return 0;
  return Number(court[side]?.[`set${setIdx}`] ?? 0) || 0;
}

export function getRegularSetWins(court) {
  if (!court) return { A: 0, B: 0 };

  const wins = { A: 0, B: 0 };
  const detail = Array.isArray(court.sets_detail) ? court.sets_detail : [];

  if (detail.length) {
    for (const setInfo of detail) {
      if (setInfo?.stb) continue;
      const left = Number(setInfo?.p1 ?? 0);
      const right = Number(setInfo?.p2 ?? 0);
      if (left > right) wins.A += 1;
      else if (right > left) wins.B += 1;
    }
    return wins;
  }

  for (let setIdx = 1; setIdx <= 2; setIdx += 1) {
    const left = getStoredSetScore(court, 'A', setIdx);
    const right = getStoredSetScore(court, 'B', setIdx);
    if (left > right) wins.A += 1;
    else if (right > left) wins.B += 1;
  }
  return wins;
}

export function isDecidingSuperTiebreak(court) {
  if (!court) return false;
  const currentSet = parseInt(court.current_set, 10) || 1;
  if (currentSet !== 3) return false;
  const wins = getRegularSetWins(court);
  return wins.A === 1 && wins.B === 1;
}

export function isTiebreak(court) {
  return computeTieVisibility(court?.tie);
}

export function isSuperTiebreak(court) {
  if (!court) return false;
  return !!court.super_tiebreak_active
    || isDecidingSuperTiebreak(court)
    || (isTiebreak(court) && (court.current_set === 3 || court.current_set === '3'));
}

export function getSetIndices(court) {
  if (!court) return [1, 2];
  const currentSet = parseInt(court.current_set, 10) || 1;
  const detail = court.sets_detail || [];
  const regularSets = detail.filter((set) => !set.stb).length;
  const indices = [];
  for (let index = 1; index <= Math.max(regularSets, 2); index += 1) indices.push(index);

  const isActive = court.match_status?.active;
  if (isActive && !isSuperTiebreak(court) && currentSet > indices.length) {
    while (indices.length < currentSet) indices.push(indices.length + 1);
  }

  if (!detail.length && !isSuperTiebreak(court)) {
    const hasThirdSetScore = getStoredSetScore(court, 'A', 3) > 0 || getStoredSetScore(court, 'B', 3) > 0;
    if (hasThirdSetScore || (isActive && currentSet >= 3)) {
      if (!indices.includes(3)) indices.push(3);
    }
  }
  return indices;
}

export function hasSuperTiebreak(court) {
  return court?.sets_detail?.some((set) => set.stb) || false;
}

export function getSuperTiebreakScore(court) {
  const superTieBreak = court?.sets_detail?.find((set) => set.stb);
  if (!superTieBreak) return null;
  return { a: superTieBreak.p1, b: superTieBreak.p2 };
}

export function getTiebreakInfo(court, setIdx) {
  const detail = court?.sets_detail;
  if (!detail || !detail[setIdx - 1]) return null;
  const entry = detail[setIdx - 1];
  if (entry.stb) return null;
  return entry.tb;
}

export function getSetScore(court, side, setIdx) {
  if (!court) return '0';
  const currentSet = parseInt(court.current_set, 10) || 1;
  if (setIdx === currentSet) {
    const currentGames = court[side]?.current_games;
    if (currentGames !== undefined && currentGames !== null) return String(currentGames);
  }
  return String(getStoredSetScore(court, side, setIdx));
}
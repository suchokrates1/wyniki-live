export function dedupePlayersList(players = []) {
  const seen = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    const gid = Number(player?.global_player_id);
    const key = Number.isFinite(gid) && gid > 0
      ? `g:${gid}`
      : `n:${String(player?.name || '').trim().toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev || Number(player?.tournament_id || 0) >= Number(prev?.tournament_id || 0)) {
      seen.set(key, player);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const last = String(a?.last_name || a?.name || '').localeCompare(String(b?.last_name || b?.name || ''));
    if (last !== 0) return last;
    return String(a?.first_name || '').localeCompare(String(b?.first_name || ''));
  });
}

export function filterPlayersList(players = [], { search = '', gender = '', country = '', category = '' } = {}) {
  let list = Array.isArray(players) ? players : [];
  const query = String(search || '').trim().toLowerCase();
  if (query) {
    list = list.filter((player) => (
      String(player?.name || '').toLowerCase().includes(query)
      || String(player?.first_name || '').toLowerCase().includes(query)
      || String(player?.last_name || '').toLowerCase().includes(query)
    ));
  }
  if (gender === 'M') {
    list = list.filter((player) => String(player?.gender || '').toUpperCase() === 'M');
  } else if (gender === 'F') {
    list = list.filter((player) => String(player?.gender || '').toUpperCase() === 'F');
  }
  if (country) {
    list = list.filter((player) => String(player?.country || '').toUpperCase() === String(country).toUpperCase());
  }
  if (category) {
    list = list.filter((player) => player?.category === category);
  }
  return list;
}

export function getPlayerCountryOptions(players = []) {
  const map = {};
  for (const player of Array.isArray(players) ? players : []) {
    const country = String(player?.country || '').toUpperCase();
    if (country) map[country] = (map[country] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([code, count]) => ({ code, count }));
}

export function getPlayerCategoryOptions(players = []) {
  const map = {};
  for (const player of Array.isArray(players) ? players : []) {
    const category = player?.category || '';
    if (category) map[category] = (map[category] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

export function normalizePlayerProfileMode(mode = 'auto') {
  return mode === 'global' || mode === 'local' ? mode : 'auto';
}

export function getPlayerProfileLookupCandidates(players = [], id, mode = 'auto') {
  const requestedMode = normalizePlayerProfileMode(mode);
  const list = Array.isArray(players) ? players : [];
  const localExists = list.some((player) => Number(player?.id) === Number(id));
  const globalExists = list.some((player) => Number(player?.global_player_id) === Number(id));
  const candidates = [];

  if (requestedMode === 'global') {
    candidates.push(true);
  } else if (requestedMode === 'local') {
    candidates.push(false);
  } else if (globalExists !== localExists) {
    candidates.push(globalExists, localExists);
  } else {
    candidates.push(true, false);
  }

  return candidates.filter((value, index, arr) => arr.indexOf(value) === index);
}

export function getProfileMedalEmoji(medal) {
  if (medal === 'gold') return '🥇';
  if (medal === 'silver') return '🥈';
  if (medal === 'bronze') return '🥉';
  return '';
}

export function getProfileWinRate(profile) {
  if (!profile?.career) return '0%';
  const career = profile.career;
  if (career.matches === 0) return '0%';
  return `${Math.round((career.wins / career.matches) * 100)}%`;
}
/**
 * E2E fixtures — API seed helpers for the tournament E2E suite.
 * All calls target E2E_BASE_URL (default http://localhost:18087).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'e2e-admin';
const OFFICE_PASSWORD = process.env.E2E_OFFICE_PASSWORD || 'test';

let _adminToken = null;
let _activeMarker = `E2E-${Date.now()}`;

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`${options.method || 'GET'} ${url} → ${resp.status}: ${body.error || resp.statusText}`);
  }
  return body;
}

export function apiUrl(path) {
  return new URL(path, BASE_URL).toString();
}

/** Office/public pair labels insert ZWSP after ` / ` for wrapping. */
export function visibleText(value) {
  return String(value || '').replaceAll('\u200B', '');
}

export function marker() {
  return _activeMarker;
}

export function newMarker() {
  _activeMarker = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return _activeMarker;
}

export async function adminLogin() {
  if (_adminToken) return _adminToken;
  const resp = await fetchJson(apiUrl('/admin/api/auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  _adminToken = resp.token || resp.access_token || true;
  return _adminToken;
}

export function adminHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token && token !== true) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function createTournament(token, { name, startDate, endDate, courts = 4, isSimulation = true, isPublic } = {}) {
  newMarker();
  const tournamentName = name || `${_activeMarker} Test Cup`;
  const today = new Date().toISOString().slice(0, 10);
  const body = await fetchJson(apiUrl('/admin/api/tournaments'), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({
      name: tournamentName,
      start_date: startDate || today,
      end_date: endDate || today,
      active: true,
      is_simulation: isSimulation,
      // Simulation tournaments are forced private server-side; public E2E needs isSimulation: false.
      is_public: isPublic ?? !isSimulation,
      court_count: courts,
      city: 'E2E',
      country: 'PL',
      office_password: OFFICE_PASSWORD,
    }),
  });
  const tournamentId = body.tournament?.id || body.id;
  return {
    ...body,
    id: tournamentId,
    name: body.tournament?.name || tournamentName,
    tournament: body.tournament || { id: tournamentId, name: tournamentName },
  };
}

export async function resolveOfficeSlot(tournamentName, maxSlots = 80) {
  let misses = 0;
  for (let slot = 1; slot <= maxSlots; slot += 1) {
    try {
      const meta = await fetchJson(apiUrl(`/api/office/${slot}/meta`));
      misses = 0;
      if ((meta?.tournament?.name || '') === tournamentName) {
        return slot;
      }
    } catch {
      misses += 1;
      // A few empty trailing slots means we've passed the end of the office list.
      if (misses >= 3 && slot > 3) break;
    }
  }
  throw new Error(`Office slot not found for tournament "${tournamentName}"`);
}

/** Wipe leftover E2E-* tournaments that previous failed runs left behind. */
export async function cleanupAllE2E(token) {
  return fetchJson(apiUrl('/admin/api/e2e/cleanup'), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ marker: 'E2E-' }),
  });
}

export async function addPlayers(token, tournamentId, players) {
  const created = [];
  for (const player of players) {
    const body = await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/players`), {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        name: player.name,
        first_name: player.first_name,
        last_name: player.last_name,
        category: player.category || player.band || 'B1',
        country: player.country || 'PL',
        gender: player.gender || '',
      }),
    });
    created.push(body);
  }
  return { players: created, player_ids: created.map((p) => p.id) };
}

export async function saveGroups(token, tournamentId, groups) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/bracket/groups`), {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({ groups }),
  });
}

export async function fetchGroups(token, tournamentId) {
  const body = await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/bracket/groups`), {
    headers: adminHeaders(token),
  });
  // API returns a bare array (not { groups: [...] }).
  return Array.isArray(body) ? body : (body.groups || []);
}

export async function generateSchedule(token, tournamentId) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/schedule/generate`), {
    method: 'POST',
    headers: adminHeaders(token),
  });
}

export async function officeLogin(slot, password = OFFICE_PASSWORD) {
  return fetchJson(apiUrl(`/api/office/${slot}/auth`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function publishSchedule(_token, _tournamentId, slotOrName = 1) {
  const resolvedSlot = typeof slotOrName === 'number'
    ? slotOrName
    : await resolveOfficeSlot(String(slotOrName));
  const auth = await officeLogin(resolvedSlot, OFFICE_PASSWORD);
  return fetchJson(apiUrl(`/api/office/${resolvedSlot}/schedule/publish`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({}),
  });
}

export async function generateRematch(token, tournamentId, groupIds) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/schedule/generate-rematch`), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ group_ids: groupIds }),
  });
}

export async function cleanup(token) {
  console.log(`  [cleanup] marker=${_activeMarker}`);
  return fetchJson(apiUrl('/admin/api/e2e/cleanup'), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ marker: _activeMarker }),
  });
}

export async function confirmCategories(token, tournamentId, entries, { replace = true } = {}) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/categories/confirm`), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ categories: entries, replace }),
  });
}

export async function createTeam(token, tournamentId, categoryId, player1Id, player2Id) {
  const body = await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/teams`), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({
      category_id: categoryId,
      player1_id: player1Id,
      player2_id: player2Id,
    }),
  });
  return body.team || body;
}

export async function fetchAdminSchedule(token, tournamentId) {
  const body = await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/schedule`), {
    headers: adminHeaders(token),
  });
  return Array.isArray(body) ? body : (body.schedule || []);
}

export async function fetchPublicSchedule(tournamentId) {
  return fetchJson(apiUrl(`/api/tournament/${tournamentId}/schedule`));
}

export async function fetchPublicBracket(tournamentId) {
  return fetchJson(apiUrl(`/api/tournament/${tournamentId}/bracket`));
}

export async function generateKnockout(token, tournamentId) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/bracket/knockout/generate`), {
    method: 'POST',
    headers: adminHeaders(token),
  });
}

export async function officeGroupMatch(slot, officeToken, payload) {
  return fetchJson(apiUrl(`/api/office/${slot}/group-matches`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officeToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function officeKnockoutMatch(slot, officeToken, payload) {
  return fetchJson(apiUrl(`/api/office/${slot}/knockout-matches`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officeToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function officeUpdateMatch(slot, officeToken, matchId, payload) {
  return fetchJson(apiUrl(`/api/office/${slot}/matches/${matchId}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officeToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function seedDoublesTournament(token, {
  pairCount = 4,
  playFormat = 'round_robin',
  groupSpecs = null,
  courts = 4,
} = {}) {
  const tournament = await createTournament(token, {
    courts,
    isSimulation: false,
    isPublic: true,
  });
  const confirmed = await confirmCategories(token, tournament.id, [
    { label: 'B1 Double', is_doubles: true },
  ]);
  const category = (confirmed.categories || [])[0];
  if (!category?.id) throw new Error('Doubles category confirm failed');

  const players = samplePlayers(pairCount * 2);
  const bulk = await addPlayers(token, tournament.id, players);
  const ids = bulk.player_ids || [];
  if (ids.length < pairCount * 2) throw new Error(`Expected ${pairCount * 2} players, got ${ids.length}`);

  const teams = [];
  for (let i = 0; i < pairCount; i += 1) {
    teams.push(await createTeam(token, tournament.id, category.id, ids[i * 2], ids[i * 2 + 1]));
  }

  const specs = groupSpecs || [{
    name: 'B1 Double — Grupa A',
    play_format: playFormat,
    teamIndexes: teams.map((_, index) => index),
  }];
  const groups = specs.map((spec) => ({
    name: spec.name,
    tournament_category_id: category.id,
    play_format: spec.play_format || playFormat,
    teams: spec.teamIndexes.map((index) => teams[index].id),
  }));
  await saveGroups(token, tournament.id, groups);
  await generateSchedule(token, tournament.id);
  const slot = await resolveOfficeSlot(tournament.name);
  return {
    tournament,
    category,
    teams,
    players: bulk.players,
    playerIds: ids,
    slot,
  };
}

export function samplePlayers(count = 8) {
  const names = [
    'Anna Kowalska', 'Jan Nowak', 'Maria Wisniewska', 'Piotr Wojcik',
    'Katarzyna Kaminska', 'Tomasz Lewandowski', 'Agnieszka Zielinska', 'Michal Szymanski',
    'Ewa Wozniak', 'Adam Dabrowski', 'Joanna Kozlowska', 'Krzysztof Jankowski',
    'Natalia Pawlak', 'Marek Kaczmarek', 'Paulina Grabowska', 'Robert Michalski',
  ];
  return Array.from({ length: count }, (_, i) => {
    const [first] = (names[i] || `Player${i + 1} Extra`).split(' ');
    return {
      name: `${first} ${_activeMarker}-P${i + 1}`,
      category: 'B1',
      country: 'PL',
      first_name: first,
      last_name: `${_activeMarker}-P${i + 1}`,
      gender: i % 2 === 0 ? 'K' : 'M',
    };
  });
}

export { OFFICE_PASSWORD };

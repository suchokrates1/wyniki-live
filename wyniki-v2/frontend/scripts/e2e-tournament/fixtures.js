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

export async function createTournament(token, { name, startDate, endDate, courts = 4, isSimulation = true } = {}) {
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

export async function resolveOfficeSlot(tournamentName, maxSlots = 12) {
  for (let slot = 1; slot <= maxSlots; slot += 1) {
    try {
      const meta = await fetchJson(apiUrl(`/api/office/${slot}/meta`));
      if ((meta?.tournament?.name || '') === tournamentName) {
        return slot;
      }
    } catch {
      // empty / unavailable slot
    }
  }
  throw new Error(`Office slot not found for tournament "${tournamentName}"`);
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
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/bracket/groups`), {
    headers: adminHeaders(token),
  });
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

export function samplePlayers(count = 8) {
  const names = [
    'Anna Kowalska', 'Jan Nowak', 'Maria Wisniewska', 'Piotr Wojcik',
    'Katarzyna Kaminska', 'Tomasz Lewandowski', 'Agnieszka Zielinska', 'Michal Szymanski',
    'Ewa Wozniak', 'Adam Dabrowski', 'Joanna Kozlowska', 'Krzysztof Jankowski',
  ];
  return names.slice(0, count).map((fullName, i) => {
    const [first, last] = fullName.split(' ');
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

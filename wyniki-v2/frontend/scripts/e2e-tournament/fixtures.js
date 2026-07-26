/**
 * E2E fixtures — API seed helpers for the tournament E2E suite.
 * All calls target E2E_BASE_URL (default http://localhost:18087).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-admin';
const E2E_MARKER = `E2E-${Date.now()}`;

let _adminToken = null;

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
  return E2E_MARKER;
}

export async function adminLogin() {
  if (_adminToken) return _adminToken;
  const resp = await fetchJson(apiUrl('/admin/api/auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  _adminToken = resp.token;
  return _adminToken;
}

export function adminHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function createTournament(token, { name, startDate, endDate, courts = 4, isSimulation = true } = {}) {
  const tournamentName = name || `${E2E_MARKER} Test Cup`;
  const today = new Date().toISOString().slice(0, 10);
  return fetchJson(apiUrl('/admin/api/tournaments'), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({
      name: tournamentName,
      start_date: startDate || today,
      end_date: endDate || today,
      active: true,
      is_simulation: isSimulation,
      court_count: courts,
    }),
  });
}

export async function addPlayers(token, tournamentId, players) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/players/bulk`), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ players }),
  });
}

export async function saveGroups(token, tournamentId, groups) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/groups`), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ groups }),
  });
}

export async function generateSchedule(token, tournamentId) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/schedule/generate`), {
    method: 'POST',
    headers: adminHeaders(token),
  });
}

export async function publishSchedule(token, tournamentId) {
  return fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/schedule/publish`), {
    method: 'POST',
    headers: adminHeaders(token),
  });
}

export async function officeLogin(slot, password = 'test') {
  return fetchJson(apiUrl(`/api/office/${slot}/auth`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function cleanup(token) {
  console.log(`  [cleanup] marker=${E2E_MARKER}`);
  return fetchJson(apiUrl('/admin/api/e2e/cleanup'), {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ marker: E2E_MARKER }),
  });
}

export function samplePlayers(count = 8) {
  const names = [
    'Anna Kowalska', 'Jan Nowak', 'Maria Wiśniewska', 'Piotr Wójcik',
    'Katarzyna Kamińska', 'Tomasz Lewandowski', 'Agnieszka Zielińska', 'Michał Szymański',
    'Ewa Woźniak', 'Adam Dąbrowski', 'Joanna Kozłowska', 'Krzysztof Jankowski',
    'Małgorzata Mazur', 'Paweł Krawczyk', 'Magdalena Piotrowska', 'Marcin Grabowski',
  ];
  return names.slice(0, count).map((fullName, i) => {
    const [first, last] = fullName.split(' ');
    return {
      name: `${E2E_MARKER} ${fullName}`,
      band: 'B1',
      country: 'PL',
      first_name: `${E2E_MARKER} ${first}`,
      last_name: last,
      gender: i % 2 === 0 ? 'K' : 'M',
    };
  });
}

/**
 * Umpire PWA against a real backend (the E2E stack): the gates of the PWA rollout plan
 * that mocked specs cannot prove — database, overlay snapshot, outbox, director commands.
 *
 * UMPIRE_LIVE_BASE_URL   backend that also serves /umpire (e.g. http://192.168.31.10:18087)
 * E2E_ADMIN_PASSWORD     admin password of that backend
 * UMPIRE_LIVE_MARKER     optional: play on an existing E2E-* fixture (shared with the Android run)
 */
import { expect } from '@playwright/test';

export const BASE_URL = (process.env.UMPIRE_LIVE_BASE_URL || '').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
export const PIN = '4242';

let adminToken = null;

export async function api(path, { method = 'GET', body, token, allowFailure = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      break;
    } catch (error) {
      // gunicorn closes idle keep-alive sockets
      if (attempt === 1) throw error;
    }
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok && !allowFailure) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

export async function admin() {
  if (!adminToken) {
    const auth = await api('/admin/api/auth', { method: 'POST', body: { password: ADMIN_PASSWORD } });
    adminToken = auth.token;
  }
  return adminToken;
}

export function adminApi(path, options = {}) {
  return admin().then((token) => api(path, { ...options, token }));
}

export async function authorizeCourtApi(courtId, pin = PIN) {
  const auth = await api(`/api/courts/${courtId}/authorize`, { method: 'POST', body: { pin } });
  if (!auth?.token) throw new Error(`authorize ${courtId} missing token: ${JSON.stringify(auth)}`);
  return auth.token;
}

/** A public test tournament with courts (PIN set) and named players; cleaned up by marker. */
export async function createFixture({ label, courts = 2, players = 4 }) {
  const marker = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const today = new Date().toISOString().slice(0, 10);
  const created = await adminApi('/admin/api/tournaments', {
    method: 'POST',
    // public, not a simulation: the overlay snapshot only shows public tournaments' courts
    body: { name: `${marker} ${label}`, start_date: today, end_date: today, active: true, is_simulation: false, is_public: true, court_count: courts, office_password: 'test' },
  });
  const tournamentId = created.tournament?.id || created.id;
  const names = [];
  for (let index = 1; index <= players; index += 1) {
    const first = ['Ada', 'Bea', 'Cyra', 'Dora', 'Ela', 'Fela', 'Gaja', 'Hela'][index - 1] || `P${index}`;
    const last = `${marker}-P${index}`;
    await adminApi(`/admin/api/tournaments/${tournamentId}/players`, {
      method: 'POST',
      body: { first_name: first, last_name: last, name: `${first} ${last}`, category: 'B2', gender: 'K', country: 'PL' },
    });
    names.push({ first, last, full: `${first} ${last}` });
  }
  for (let court = 1; court <= courts; court += 1) {
    await adminApi(`/admin/api/courts/t${tournamentId}-${court}/pin`, { method: 'PUT', body: { pin: PIN } });
  }
  return { marker, tournamentId, name: `${marker} ${label}`, players: names, court: (n) => `t${tournamentId}-${n}` };
}

/** The fixture the Android wave created (players ordered by their P-number, as the Android client does). */
export async function loadFixture(marker) {
  const artifacts = await adminApi(`/admin/api/e2e/artifacts?marker=${encodeURIComponent(marker)}`);
  const tournament = artifacts.tournaments[0];
  const rows = await adminApi(`/admin/api/tournaments/${tournament.id}/players`);
  const list = (Array.isArray(rows) ? rows : rows.players || [])
    .map((row) => ({ first: row.first_name, last: row.last_name, full: `${row.first_name} ${row.last_name}` }))
    .sort((a, b) => Number(a.last.match(/P(\d+)$/)?.[1] || 0) - Number(b.last.match(/P(\d+)$/)?.[1] || 0));
  return { marker, tournamentId: tournament.id, name: tournament.name, players: list, court: (n) => `t${tournament.id}-${n}` };
}

export async function cleanupFixture(fixture) {
  if (fixture?.marker && !process.env.UMPIRE_LIVE_KEEP) {
    await adminApi('/admin/api/e2e/cleanup', { method: 'POST', body: { marker: fixture.marker }, allowFailure: true });
  }
}

export async function artifacts(marker) {
  return adminApi(`/admin/api/e2e/artifacts?marker=${encodeURIComponent(marker)}`);
}

export async function waitForMatch(marker, predicate, { timeoutMs = 30_000, message = 'match on the server' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await artifacts(marker);
    const match = last.matches.find(predicate);
    if (match) return { match, artifacts: last };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${message}; matches: ${JSON.stringify(last?.matches?.map((m) => [m.player1_name, m.status, m.court_id]))}`);
}

export async function courtSnapshot(courtId) {
  const snapshot = await api('/api/snapshot');
  return snapshot.courts?.[courtId];
}

export async function openUmpire(context, { language = 'English' } = {}) {
  await context.addInitScript(() => {
    localStorage.setItem('umpire.tutorial_prompted', '1');
    sessionStorage.setItem('umpire.pwa_gate_dismissed', '1');
  });
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', (error) => { page.__errors = [...(page.__errors || []), String(error)]; });
  if (process.env.UMPIRE_LIVE_DEBUG) {
    page.on('response', async (response) => {
      const url = response.url();
      if (!/\/api\/(matches|match-events|match-statistics|umpire\/commands)/.test(url)) return;
      const request = response.request();
      let detail = '';
      try {
        const json = JSON.parse(await response.text());
        detail = JSON.stringify({ status: json.status, court: json.court_id, points: json.score ? [json.score.player1_points, json.score.player2_points] : undefined, commands: Array.isArray(json.commands) ? json.commands.map((c) => ({ type: c.type || c.command_type, court: c.court_id || c.payload?.court_id, score: c.score || c.payload?.score })) : undefined, finish: json.finish_reason, error: json.error });
      } catch { /* not json */ }
      const sent = (request.postData() || '').slice(0, 220);
      console.log(`  [api] ${request.method()} ${url.replace(BASE_URL, '')} -> ${response.status()} ${detail} <= ${sent}`);
    });
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) console.log(`  [console] ${message.text().slice(0, 300)}`); });
    page.on('requestfailed', (request) => console.log(`  [api-failed] ${request.method()} ${request.url().replace(BASE_URL, '')} ${request.failure()?.errorText}`));
  }
  await page.goto(`${BASE_URL}/umpire`);
  await page.locator('h1.ump-title').first().waitFor();
  if (language && await page.getByRole('button', { name: new RegExp(language) }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: new RegExp(language) }).click();
  }
  return page;
}

export async function enterPin(page, pin) {
  for (const digit of pin) {
    await page.locator('.ump-pad button', { hasText: new RegExp(`^${digit}$`) }).click();
  }
}

export async function authorizeCourt(page, fixture, courtNumber, pin = PIN) {
  await page.getByRole('button', { name: new RegExp(fixture.marker) }).click();
  await page.getByRole('button', { name: new RegExp(`Court ${courtNumber}\\b`) }).click();
  await enterPin(page, pin);
}

/** From the players screen to the scoring screen. */
export async function startMatch(page, { players, doubles = false, advanced = false, gamesPerSet = null, setsToWin = null, noAdvantage = false, firstServer = 0 }) {
  await expect(page.locator('h1.ump-title')).toHaveText('Select Players', { timeout: 15_000 });
  if (doubles) await page.getByRole('button', { name: 'Doubles' }).click();
  for (const player of players) {
    await page.getByRole('button', { name: new RegExp(player.last) }).click();
  }
  await expect(page.locator('h1.ump-title')).toHaveText('Match Setup', { timeout: 10_000 });
  if (gamesPerSet) await page.getByRole('group', { name: 'Games per set' }).getByRole('button', { name: String(gamesPerSet), exact: true }).click();
  if (setsToWin) await page.getByRole('group', { name: 'Sets to win' }).getByRole('button', { name: String(setsToWin), exact: true }).click();
  if (noAdvantage) await page.getByRole('switch', { name: 'No-Advantage (Deciding Point)' }).click();
  if (advanced) await page.getByRole('switch', { name: 'Advanced' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Who serves first?', { timeout: 10_000 });
  // team 1 = the first player picked (and their partner in doubles)
  page.__teams = doubles ? [players[0].last, players[2].last] : [players[0].last, players[1].last];
  await page.locator('.ump-serve-btn').nth(firstServer).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Match', { timeout: 10_000 });
}

export async function dismissAnnouncement(page) {
  const announcement = page.locator('.ump-announce.is-shown');
  if (await announcement.isVisible().catch(() => false)) {
    await announcement.getByRole('button', { name: 'Continue' }).click();
    await expect(announcement).toBeHidden();
  }
}

/** Board row (0 = team 1) of the side holding the serve ball. */
export async function serverRow(page) {
  return page.locator('.ump-board__serve').evaluateAll((els) => els.findIndex((el) => el.classList.contains('is-on')));
}

/**
 * Advanced point the way the Android robot plays it: the server wins with an ACE,
 * the receiver wins on a double fault.
 */
export async function advancedPoint(page, team1Wins) {
  await dismissAnnouncement(page);
  const serverIsTeam1 = (await serverRow(page)) === 0;
  if (team1Wins === serverIsTeam1) {
    await page.getByRole('button', { name: 'ACE', exact: true }).first().click();
  } else {
    await page.getByRole('button', { name: 'FAULT', exact: true }).first().click();
    await page.getByRole('button', { name: 'FAULT', exact: true }).first().click();
  }
}

/** Basic point: WIN in the column of the team that takes it (columns follow the change of ends). */
export async function basicPoint(page, team1Wins) {
  await dismissAnnouncement(page);
  const team = page.__teams[team1Wins ? 0 : 1];
  await page.locator('.ump-basic__col').filter({ hasText: team }).getByRole('button', { name: 'WIN' }).click();
}

export async function playGame(page, team1Wins, pointFn = basicPoint) {
  for (let point = 0; point < 4; point += 1) await pointFn(page, team1Wins);
  await dismissAnnouncement(page);
}

export async function boardPoints(page) {
  return page.locator('.ump-board__pts').allTextContents();
}

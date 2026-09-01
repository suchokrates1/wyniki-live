export function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function mockUmpireApi(page, options = {}) {
  const authorizeOk = options.authorize !== false;
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/tournaments/active')) {
      return route.fulfill({ json: [{ id: 31, name: 'Vilnius E2E' }] });
    }
    if (url.includes('/authorize')) {
      if (!authorizeOk) {
        return route.fulfill({ json: { authorized: false } });
      }
      return route.fulfill({
        json: {
          authorized: true,
          token: 'e2e-token',
          court_id: 't31-1',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });
    }
    if (url.includes('/suggested-match')) {
      return route.fulfill({ json: { suggestion: null } });
    }
    if (url.includes('/courts')) {
      return route.fulfill({
        json: { courts: [{ kort_id: 't31-1', name: 'Court 1', is_available: true }] },
      });
    }
    if (url.includes('/players') && method === 'GET') {
      return route.fulfill({
        json: {
          players: [
            { id: 1, name: 'Kowalski', first_name: 'Jan', last_name: 'Kowalski' },
            { id: 2, name: 'Nowak', first_name: 'Adam', last_name: 'Nowak' },
            { id: 3, name: 'Lis', first_name: 'Ewa', last_name: 'Lis' },
            { id: 4, name: 'Wojcik', first_name: 'Anna', last_name: 'Wojcik' },
          ],
        },
      });
    }
    if (url.includes('/matches') && method === 'POST') {
      return route.fulfill({ json: { id: 99 } });
    }
    if (url.includes('umpire-heartbeat') || url.includes('/umpire/commands')) {
      return route.fulfill({ json: { status: 'ok', commands: [] } });
    }
    return route.fulfill({ status: 200, json: { ok: true } });
  });
}

export async function seedLanguage(page, lang = 'en') {
  await page.addInitScript((code) => {
    localStorage.setItem('umpire.selected_language', code);
  }, lang);
}

export async function seedThroughCourt(page) {
  await page.addInitScript((payload) => {
    localStorage.setItem('umpire.selected_language', 'en');
    localStorage.setItem('umpire.selected_tournament', JSON.stringify(payload.tournament));
    localStorage.setItem('umpire.court_session', JSON.stringify(payload.court));
  }, {
    tournament: { id: 31, name: 'Vilnius E2E', day: todayKey() },
    court: {
      courtId: 't31-1',
      courtName: 'Court 1',
      token: 'e2e-token',
      expiresAtMillis: Date.now() + 3_600_000,
    },
  });
}

export async function openUmpire(page, hash = '') {
  await page.goto(`/umpire.html${hash}`);
  await page.locator('.ump-title').waitFor();
}

export async function enterPin(page, pin = '1234') {
  for (const digit of pin) {
    await page.locator('.ump-pad button', { hasText: new RegExp(`^${digit}$`) }).click();
  }
}

export async function openPinPad(page) {
  await seedLanguage(page, 'en');
  await page.addInitScript((day) => {
    localStorage.setItem('umpire.selected_tournament', JSON.stringify({
      id: 31,
      name: 'Vilnius E2E',
      day,
    }));
  }, todayKey());
  await openUmpire(page, '#/court');
  await page.getByRole('button', { name: 'Court 1' }).click();
}

export async function startBasicMatch(page) {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await page.locator('h1.ump-title').filter({ hasText: 'Match setup' }).waitFor({ timeout: 5_000 });
  await page.locator('.ump-mode').filter({ hasText: 'Basic' }).click();
  await page.getByRole('button', { name: /Kowalski/ }).first().click();
}

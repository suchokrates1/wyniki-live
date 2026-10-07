/**
 * The organizer at work on the mock API, with state: a tournament of the series, its
 * settings, players from the shared base, courts and the office, the change log.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

function world({ lock = '', validUntil = '2027-10-31', active = 0, maxYear = 0, maxCourts = 0 } = {}) {
  const state = {
    tournament: {
      id: 28, name: '5th Dürener Handicup 2026', start_date: '2026-07-17', end_date: '2026-07-19', city: 'Düren', country: 'DE',
      active, is_public: lock ? 0 : 1, is_simulation: 0, court_count: 2, has_office_password: 1, title_scope: 'open', title_override: '',
      visibility_lock: lock, series: [{ id: 1, name: 'Takei World Tennis Tour', tier: 'CH50' }],
      courts: [{ kort_id: 't28-1', name: '1', pin: '1234' }, { kort_id: 't28-2', name: '2', pin: '5678' }],
      office_slot: active ? 2 : null, overlays: [{ id: 'k1', name: 'Kort 1', path: active ? '/overlay/2/k1' : '' }],
      read_only: validUntil < new Date().toISOString().slice(0, 10),
      max_courts: maxCourts,
    },
    entries: [{ id: 1, name: 'Carlos Arbos', first_name: 'Carlos', last_name: 'Arbos', category: 'B1', country: 'FR', gender: 'M', global_player_id: 3 }],
    base: [{ id: 3, first_name: 'Carlos', last_name: 'Arbos', category: 'B1', country: 'FR', gender: 'M', tournaments_count: 2 },
      { id: 7, first_name: 'Naqi', last_name: 'Rizvi', category: 'B1', country: 'GB', gender: 'M', tournaments_count: 3 }],
    requests: [],
  };
  state.me = { account: { id: 5, email: 'organizer@example.org' }, contact_email: 'organizers@blindtennis.app', series: [{ id: 1, name: 'Takei World Tennis Tour', slug: 'twt', role: 'owner', valid_until: validUntil, max_tournaments_per_year: maxYear, max_courts: maxCourts, tournaments: [{ ...state.tournament, tier: 'CH50' }] }] };
  return state;
}

async function openPanel(page, state, hash = '#/twt') {
  await page.route(/\/organizer\/api\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/organizer/api', '');
    const method = request.method();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    state.requests.push({ method, path, body });
    const t = state.tournament;
    if (path === '/me') return route.fulfill({ json: state.me });
    if (path === '/tournaments/28' && method === 'GET') return route.fulfill({ json: t });
    if (path === '/tournaments/28' && method === 'PUT') {
      Object.assign(t, body, { is_public: t.visibility_lock ? 0 : Number(!!body.is_public) });
      return route.fulfill({ json: { message: 'ok', tournament: t } });
    }
    if (path === '/tournaments/28/active') {
      t.active = body.active ? 1 : 0;
      t.office_slot = t.active ? 2 : null;
      return route.fulfill({ json: { active: !!body.active, tournament: t } });
    }
    if (path === '/tournaments/28/office-session') return route.fulfill({ json: { slot: 2, tournament_id: 28, token: 'office-token' } });
    if (path.startsWith('/tournaments/28/courts/')) return route.fulfill({ json: { pin: body.pin } });
    if (path === '/tournaments/28/players' && method === 'GET') return route.fulfill({ json: state.entries });
    if (path === '/tournaments/28/players/add-global') {
      const person = state.base.find((row) => row.id === body.global_player_id);
      state.entries.push({ id: 10 + state.entries.length, name: `${person.first_name} ${person.last_name}`, ...person, global_player_id: person.id });
      return route.fulfill({ status: 201, json: {} });
    }
    if (/^\/tournaments\/28\/players\/\d+$/.test(path)) return route.fulfill({ json: { message: 'ok' } });
    if (path === '/players' && method === 'GET') {
      const q = url.searchParams.get('q').toLowerCase();
      return route.fulfill({ json: state.base.filter((row) => `${row.first_name} ${row.last_name}`.toLowerCase().includes(q)) });
    }
    if (path === '/players' && method === 'POST') {
      const person = { id: 50, ...body };
      state.base.push(person);
      return route.fulfill({ status: 201, json: person });
    }
    if (/^\/players\/\d+$/.test(path)) return route.fulfill({ json: { ...body, queued_for_review: true } });
    if (path === '/tournaments/28/categories') return route.fulfill({ json: { categories: [{ id: 1, label: 'B1 Men' }] } });
    if (path === '/tournaments/28/categories/confirm') return route.fulfill({ json: { categories: [{ id: 1, label: 'B1 Men' }, { id: 2, label: 'B2 kobiety' }] } });
    if (path === '/tournaments/28/log') return route.fulfill({ json: [{ id: 2, action: 'court_pin', account_email: 'organizer@example.org', created_at: '2026-10-07T12:00:00Z' }] });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); sessionStorage.setItem('wyniki-organizer-token', 'org-token'); } });
  await page.goto(`/organizer${hash}`);
}

async function axe(page) {
  const results = await new AxeBuilder({ page }).include('.org-main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
}

test('from the series to a tournament, its settings saved without the live switch', async ({ page }) => {
  const state = world();
  await openPanel(page, state);
  await page.getByRole('link', { name: '5th Dürener Handicup 2026', exact: true }).click();
  await expect(page).toHaveURL(/#\/twt\/t\/28$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('5th Dürener Handicup 2026');
  await expect(page.getByRole('tab', { name: 'Ustawienia' })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Miasto').fill('Aachen');
  await page.getByRole('button', { name: 'Zapisz ustawienia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Zapisano.' })).toBeVisible();
  const put = state.requests.find((r) => r.method === 'PUT' && r.path === '/tournaments/28');
  expect(put.body.city).toBe('Aachen');
  expect(put.body).not.toHaveProperty('active');
  expect(await axe(page)).toEqual([]);
});

test('the admin’s lock leaves the public switch off and says why', async ({ page }) => {
  await openPanel(page, world({ lock: 'private' }), '#/twt/t/28');
  await expect(page.getByLabel('Publiczny na blindtennis.app')).toBeDisabled();
  await expect(page.getByText('Administrator zablokował publikację')).toBeVisible();
  await expect(page.locator('.org-sub')).toContainText('blokada publikacji');
});

test('a player found in the base is entered, a correction says the admin will look', async ({ page }) => {
  const state = world();
  await openPanel(page, state, '#/twt/t/28/zawodnicy');
  await expect(page.locator('#org-entries-title + .adm-card__hint')).toHaveText('1 zgłoszenie');
  await page.getByLabel('Imię lub nazwisko').fill('Rizvi');
  await page.getByRole('button', { name: /^Zgłoś\s*: Naqi Rizvi$/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'zgłoszony do turnieju' })).toBeVisible();
  await expect(page.locator('#org-entries-title + .adm-card__hint')).toHaveText('2 zgłoszenia');
  await expect(page.locator('#org-find-count')).toHaveText('Znaleziono: 1');
  await expect(page.locator('.adm-chip', { hasText: 'zgłoszony' })).toBeVisible();

  await page.getByRole('button', { name: /^Popraw\s*: Carlos Arbos$/ }).click();
  await page.getByRole('form', { name: 'Popraw: Carlos Arbos' }).getByLabel('Klasa').selectOption('B2');
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'zmianę sprawdzi jeszcze administrator' })).toBeVisible();
  expect(state.requests.find((r) => r.method === 'PUT' && r.path === '/players/3').body.category).toBe('B2');
  expect(await axe(page)).toEqual([]);
});

test('someone new goes into the base and into the tournament', async ({ page }) => {
  const state = world();
  await openPanel(page, state, '#/twt/t/28/zawodnicy');
  await page.getByLabel('Imię', { exact: true }).fill('Ola');
  await page.getByLabel('Nazwisko', { exact: true }).fill('Testowa');
  await page.getByLabel('Klasa', { exact: true }).selectOption('B3');
  await page.getByRole('button', { name: 'Dodaj do bazy i zgłoś' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Nowy zawodnik dodany' })).toBeVisible();
  expect(state.requests.find((r) => r.method === 'POST' && r.path === '/players').body).toMatchObject({ first_name: 'Ola', last_name: 'Testowa', category: 'B3' });
});

test('the tournament goes live, PINs change, and the office opens without its password', async ({ page }) => {
  const state = world();
  await openPanel(page, state, '#/twt/t/28/korty');
  await expect(page.getByRole('button', { name: 'Otwórz biuro turnieju' })).toBeHidden();
  await page.getByLabel('PIN kortu 2').fill('4821');
  await page.getByRole('button', { name: /^Zapisz PIN\s*: kort 2$/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'PIN kortu 2 zapisany.' })).toBeVisible();
  expect(state.requests.find((r) => r.path === '/tournaments/28/courts/t28-2/pin').body).toEqual({ pin: '4821' });
  expect(await axe(page)).toEqual([]);

  await page.getByRole('button', { name: 'Turniej trwa — włącz' }).click();
  await expect(page.locator('.org-sub')).toContainText('trwa');
  await page.route(/\/office\/2$/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>biuro</title><h1>biuro</h1>' }));
  await page.getByRole('button', { name: 'Otwórz biuro turnieju' }).click();
  await expect(page).toHaveURL(/\/office\/2$/);
  expect(await page.evaluate(() => sessionStorage.getItem('office-token-t28'))).toBe('office-token');
});

test('categories and the change log', async ({ page }) => {
  const state = world();
  await openPanel(page, state, '#/twt/t/28/kategorie');
  await page.getByLabel('B2 kobiety').check();
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(page.locator('.adm-row__name', { hasText: 'B2 kobiety' })).toBeVisible();
  expect(state.requests.find((r) => r.path === '/tournaments/28/categories/confirm').body).toEqual({ categories: [{ preset_key: 'B2K', is_doubles: false }] });
  await page.getByRole('tab', { name: 'Historia zmian' }).click();
  await expect(page.locator('.org-log')).toContainText('zmieniono PIN kortu');
  expect(await axe(page)).toEqual([]);
});

test('a lapsed subscription leaves the panel to read only', async ({ page }) => {
  await openPanel(page, world({ validUntil: '2020-01-01' }), '#/twt/t/28/zawodnicy');
  await expect(page.locator('.org-banner').filter({ hasText: 'wygasł' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Popraw/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Dodaj z bazy zawodników' })).toBeHidden();
  await page.getByRole('tab', { name: 'Ustawienia' }).click();
  await expect(page.getByLabel('Miasto')).toBeDisabled();
  await page.locator('.org-back').click();
  await expect(page.getByRole('button', { name: 'Nowy turniej' })).toBeHidden();
});

test('on a phone nothing scrolls sideways', async ({ page }) => {
  await openPanel(page, world(), '#/twt/t/28/zawodnicy');
  await expect(page.locator('.adm-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});


function isoInDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

test('ten days before the end the panel says so, with the address to write to', async ({ page }) => {
  await openPanel(page, world({ validUntil: isoInDays(10), maxYear: 5, maxCourts: 4 }));
  const banner = page.locator('.org-banner').filter({ hasText: 'kończy się' });
  await expect(banner).toContainText('za 10 dni');
  await expect(banner.getByRole('link', { name: 'organizers@blindtennis.app' })).toHaveAttribute('href', 'mailto:organizers@blindtennis.app');
  const year = new Date().getFullYear();
  await expect(page.locator('.org-facts')).toContainText(`Turnieje w ${year}:`);
  await expect(page.locator('.org-facts')).toContainText('z 5');
  await expect(page.locator('.org-facts')).toContainText('do 4');
  await page.getByRole('link', { name: '5th Dürener Handicup 2026', exact: true }).click();
  await expect(page.getByText('Abonament: do 4 kortów.')).toBeVisible();
  await expect(page.getByLabel('Liczba kortów')).toHaveAttribute('max', '4');
});

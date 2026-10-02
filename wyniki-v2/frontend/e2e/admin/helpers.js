/** Opens the admin on the mock API. No real password: a stand-in token skips the login screen. */
export const TOURNAMENTS = [
  { id: 32, name: 'RAKIETY ATNiS VII', start_date: '2026-09-26', end_date: '2026-09-27', city: 'Giebułtów', country: 'PL', court_count: 4, active: 1, is_public: 1, stats_enabled: 1, is_simulation: 0, report_email: 'biuro@atnis.pl', has_office_password: 1 },
  { id: 31, name: 'IBTA World Blind Tennis Championships 2026', start_date: '2026-08-27', end_date: '2026-08-29', city: 'Wilno', country: 'LT', court_count: 11, active: 0, is_public: 1, stats_enabled: 1, is_simulation: 0, report_email: '' },
  { id: 26, name: 'App Review Access', start_date: '2026-05-23', end_date: '2027-05-23', city: 'Review', country: 'US', court_count: 1, active: 1, is_public: 0, stats_enabled: 0, is_simulation: 1, report_email: '' },
];

export const PLAYERS = [
  { id: 7, first_name: 'Mateusz', last_name: 'Ciborowski', country: 'PL', category: 'B2', birth_date: '1990-05-10', tournaments_count: 3 },
  { id: 9, first_name: 'Indrė', last_name: 'Zuzevičiūtė Praškevičienė', country: 'LT', category: 'B2', tournaments_count: 1 },
  { id: 11, first_name: 'Dajana', last_name: 'Zgrzebska', country: 'PL', category: 'B4', tournaments_count: 2 },
];

// Who is already entered in tournament 32
export const ENTRIES = [{ id: 501, global_player_id: 7, first_name: 'Mateusz', last_name: 'Ciborowski', category: 'B2' }];

export async function openAdmin(page, { tournaments = TOURNAMENTS, players = PLAYERS, entries = ENTRIES, onRequest = () => {} } = {}) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('wyniki-admin-token', 'e2e-token'); } catch { /* private mode */ }
  });

  await page.route(/\/admin\/api\/.*/, async (route) => {
    const request = route.request();
    const url = request.url();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); } // create sends FormData
    onRequest({ url, method: request.method(), body });
    if (request.method() !== 'GET') return route.fulfill({ json: { success: true } });
    if (/\/admin\/api\/tournaments(\?|$)/.test(url)) return route.fulfill({ json: tournaments });
    if (url.includes('/admin/api/courts')) return route.fulfill({ json: [] });
    if (url.includes('/admin/api/devices')) return route.fulfill({ json: { devices: [] } });
    if (/\/admin\/api\/global-players(\?|$)/.test(url)) return route.fulfill({ json: players });
    if (url.includes('/admin/api/global-players')) return route.fulfill({ json: [] });
    if (/\/tournaments\/\d+\/players(\?|$)/.test(url)) return route.fulfill({ json: entries });
    if (url.includes('/admin/api/panic')) return route.fulfill({ json: { enabled: false, recipients: [] } });
    if (url.includes('/admin/api/overlay')) return route.fulfill({ json: { overlays: {}, settings: {} } });
    return route.fulfill({ json: {} });
  });
  await page.route(/\/api\/snapshot(\?|$)/, (route) => route.fulfill({ json: { courts: {} } }));
  await page.route(/\/api\/stream(\?|$)/, (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/admin.html');
  await page.locator('.adm-rail__item').first().waitFor();
  await page.waitForTimeout(300);
  const consent = page.locator('.consent-banner');
  if (await consent.isVisible().catch(() => false)) {
    await consent.locator('.consent-banner__btn--ghost').click();
    await consent.waitFor({ state: 'hidden' });
  }
}

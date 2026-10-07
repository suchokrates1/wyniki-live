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

export const COURTS = [
  { kort_id: 't32-1', name: '1', pin: '0000', tournament_id: 32, tournament_name: 'RAKIETY ATNiS VII', active: 1 },
  { kort_id: 't32-2', name: '2', pin: '0000', tournament_id: 32, tournament_name: 'RAKIETY ATNiS VII', active: 1 },
  { kort_id: 't32-3', name: '3', pin: '8261', tournament_id: 32, tournament_name: 'RAKIETY ATNiS VII', active: 1 },
];

export const DEVICES = [
  { android_id: 'new-1', name: '', battery_level: 96, is_charging: false, app_version: '1.0.0-dev.38', device_model: 'SM-X115', court_id: null, last_seen: new Date().toISOString() },
  { android_id: 'tab-1', name: 'Tablet 1', battery_level: 82, is_charging: false, app_version: '1.0.0-dev.38', court_id: 't32-1', last_seen: new Date().toISOString() },
  { android_id: 'tab-3', name: 'Tablet 3', battery_level: 17, is_charging: false, app_version: '1.0.0-dev.37', court_id: 't32-3', last_seen: new Date().toISOString() },
];

export const PANIC = {
  enabled: true,
  recipients: [
    { id: 1, name: 'Reżyserka', chat_id: '48111222333@c.us', enabled: true },
    { id: 2, name: 'Dawid', chat_id: '48444555666@c.us', enabled: false },
  ],
};

export const EMAIL_SETTINGS = {
  smtp_host: 'smtp.ovh.net', smtp_port: 587, smtp_username: 'turniej@blindtennis.app',
  smtp_from_email: 'turniej@blindtennis.app', smtp_from_name: 'Wyniki Live', smtp_use_tls: true,
};

/** Opens a section by its address: on a phone two of them live behind the "Więcej" menu. */
export async function openSection(page, id, heading) {
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/${id}`);
  await page.locator('.adm-main__head h1').filter({ hasText: heading }).waitFor();
}

/** Phone emulation mis-hits elements the bottom bar overlaps; the keyboard path is real too. */
export async function press(locator, page) {
  await locator.focus();
  await page.keyboard.press('Enter');
}

export async function openAdmin(page, { token = true, tournaments = TOURNAMENTS, players = PLAYERS, entries = ENTRIES, courts = COURTS, devices = DEVICES, panic = PANIC, emailSettings = EMAIL_SETTINGS, snapshot = {}, onRequest = () => {}, signIn = false, series = [], reviews = [] } = {}) {
  // Seeded once per tab: a sign-out or an expired session must stick across the redirects.
  await page.addInitScript((hasToken) => {
    try {
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      if (hasToken) sessionStorage.setItem('wyniki-admin-token', 'e2e-token');
      else sessionStorage.removeItem('wyniki-admin-token');
    } catch { /* private mode */ }
  }, token);

  await page.route(/\/admin\/api\/.*/, async (route) => {
    const request = route.request();
    const url = request.url();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); } // create sends FormData
    onRequest({ url, method: request.method(), body });
    if (request.method() !== 'GET') return route.fulfill({ json: { success: true } });
    if (/\/admin\/api\/tournaments(\?|$)/.test(url)) return route.fulfill({ json: tournaments });
    if (/\/admin\/api\/series(\?|$)/.test(url)) return route.fulfill({ json: series });
    if (/\/admin\/api\/player-reviews(\?|$)/.test(url)) return route.fulfill({ json: reviews });
    if (url.includes('/admin/api/courts')) return route.fulfill({ json: courts });
    if (url.includes('/admin/api/devices')) return route.fulfill({ json: { devices } });
    if (/\/admin\/api\/global-players(\?|$)/.test(url)) return route.fulfill({ json: players });
    if (url.includes('/admin/api/global-players')) return route.fulfill({ json: [] });
    if (/\/tournaments\/\d+\/players(\?|$)/.test(url)) return route.fulfill({ json: entries });
    if (url.includes('/admin/api/panic')) return route.fulfill({ json: panic });
    if (url.includes('/admin/api/settings/email')) return route.fulfill({ json: emailSettings });
    if (url.includes('/admin/api/overlay')) return route.fulfill({ json: { overlays: {}, settings: {} } });
    return route.fulfill({ json: {} });
  });
  await page.route(/\/api\/snapshot(\?|$)/, (route) => route.fulfill({ json: { courts: snapshot } }));
  await page.route(/\/api\/stream(\?|$)/, (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/admin.html');
  // without a session the panel hands over to the sign-in page
  if (signIn) return;
  await page.locator('.adm-rail__item').first().waitFor();
  await page.waitForTimeout(300);
  const consent = page.locator('.consent-banner');
  if (await consent.isVisible().catch(() => false)) {
    await consent.locator('.consent-banner__btn--ghost').click();
    await consent.waitFor({ state: 'hidden' });
  }
}

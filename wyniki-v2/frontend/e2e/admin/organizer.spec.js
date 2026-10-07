/**
 * The organizer's side on the mock API: signing in, setting a password from an
 * invitation, the panel with the series and its tournaments, signing out.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { randomBytes } from 'node:crypto';

// made up per run: no password literal sits in the repository
const PASSWORD = randomBytes(9).toString('base64url');
const WRONG = `${PASSWORD}-zle`;
const ME = {
  account: { id: 5, email: 'organizer@example.org', name: 'Jan Testowy' },
  series: [{
    id: 1, name: 'Takei World Tennis Tour', slug: 'twt', website: 'https://takeitour.com', valid_until: '2027-10-31', role: 'owner',
    tournaments: [
      { id: 31, name: 'IBTA World Blind Tennis Championships 2026', start_date: '2026-08-25', end_date: '2026-08-29', city: 'Wilno', country: 'LT', tier: '500', is_public: 1, is_simulation: 0 },
      { id: 28, name: '5th Dürener Handicup 2026', start_date: '2026-07-17', end_date: '2026-07-19', city: 'Düren', country: 'DE', tier: 'CH50', is_public: 1, is_simulation: 0 },
    ],
  }],
};

async function mockApi(page, { attempts = { n: 0 } } = {}) {
  await page.route(/\/organizer\/api\/auth$/, (route) => {
    attempts.n += 1;
    const { email, password } = route.request().postDataJSON();
    if (attempts.n > 3) return route.fulfill({ status: 429, json: {} });
    if (email === 'organizer@example.org' && password === PASSWORD) return route.fulfill({ json: { token: 'org-token' } });
    return route.fulfill({ status: 403, json: {} });
  });
  await page.route(/\/organizer\/api\/invite\/good$/, (route) => (route.request().method() === 'GET'
    ? route.fulfill({ json: { email: 'organizer@example.org', name: 'Jan', series: ['Takei World Tennis Tour'], min_length: 10 } })
    : route.fulfill({ json: { token: 'org-token' } })));
  await page.route(/\/organizer\/api\/invite\/spent$/, (route) => route.fulfill({ status: 410, json: {} }));
  await page.route(/\/organizer\/api\/me$/, (route) => (route.request().headers().authorization === 'Bearer org-token'
    ? route.fulfill({ json: ME })
    : route.fulfill({ status: 401, json: {} })));
}

async function axe(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
}

test('without a session the panel sends you to sign in, and back after it', async ({ page }) => {
  await mockApi(page);
  await page.goto('/organizer');
  await expect(page).toHaveURL(/\/organizer\/login/);
  await expect(page.getByRole('heading', { name: 'Panel organizatora' })).toBeVisible();

  await page.getByLabel('E-mail').fill('organizer@example.org');
  await page.getByLabel('Hasło', { exact: true }).fill(WRONG);
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy e-mail lub hasło.');

  await page.getByRole('button', { name: 'Pokaż hasło' }).click();
  await expect(page.getByLabel('Hasło', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj' }).click();

  await expect(page).toHaveURL(/\/organizer#\/twt$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Takei World Tennis Tour');
  const rows = page.locator('.adm-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('500');
  await expect(rows.nth(1)).toContainText('Challenger 50');
  await expect(rows.nth(1)).toContainText('17–19.07.2026 · Düren · DE');
  await expect(page.locator('.org-facts')).toContainText('31.10.2027');
});

test('too many wrong passwords are said plainly', async ({ page }) => {
  await mockApi(page, { attempts: { n: 3 } });
  await page.goto('/organizer/login');
  await page.getByLabel('E-mail').fill('organizer@example.org');
  await page.getByLabel('Hasło', { exact: true }).fill(WRONG);
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByRole('alert')).toContainText('Za dużo nieudanych prób');
});

test('an invitation sets the password and goes straight in, leaving no token in the address', async ({ page }) => {
  await mockApi(page);
  await page.goto('/organizer/invite?token=good');
  await expect(page.getByRole('heading', { name: 'Ustaw hasło' })).toBeVisible();
  await expect(page).toHaveURL(/\/organizer\/invite$/);
  await expect(page.getByLabel('E-mail')).toHaveValue('organizer@example.org');
  await expect(page.getByLabel('E-mail')).toHaveAttribute('readonly', '');

  await page.getByLabel('Nowe hasło').fill(PASSWORD.slice(0, 4));
  await page.getByRole('button', { name: 'Ustaw hasło i wejdź' }).click();
  await expect(page.getByRole('alert')).toHaveText('Hasło musi mieć co najmniej 10 znaków.');
  await page.getByLabel('Nowe hasło').fill(PASSWORD);
  await page.getByLabel('Powtórz hasło').fill(PASSWORD + 'x');
  await page.getByRole('button', { name: 'Ustaw hasło i wejdź' }).click();
  await expect(page.getByRole('alert')).toHaveText('Hasła się różnią.');
  await page.getByLabel('Powtórz hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ustaw hasło i wejdź' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Takei World Tennis Tour');
});

test('a spent invitation says so and leaves the sign-in form', async ({ page }) => {
  await mockApi(page);
  await page.goto('/organizer/invite?token=spent');
  await expect(page.getByRole('status')).toContainText('wygasł albo został już użyty');
  await expect(page.getByRole('heading', { name: 'Panel organizatora' })).toBeVisible();
});

test('signing out lands on the sign-in page, and the panel stays closed', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); sessionStorage.setItem('wyniki-organizer-token', 'org-token'); } });
  await page.goto('/organizer');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Takei World Tennis Tour');
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/organizer\/login\?reason=out$/);
  await expect(page.getByRole('status')).toHaveText('Wylogowano z tego urządzenia.');
  await page.goto('/organizer');
  await expect(page).toHaveURL(/\/organizer\/login/);
});

test('both pages pass axe and fit the screen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/organizer/login');
  await expect(page.getByRole('heading', { name: 'Panel organizatora' })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await page.evaluate(() => sessionStorage.setItem('wyniki-organizer-token', 'org-token'));
  await page.goto('/organizer');
  await expect(page.locator('.adm-row')).toHaveCount(2);
  expect(await axe(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

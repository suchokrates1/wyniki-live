/**
 * The admin's sign-in page: its own address, back to the section you asked for,
 * a wrong password said plainly, and sign-out or an expired session landing here.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openAdmin } from './helpers.js';

const PASSWORD = 'e2e-admin';

async function stubSignIn(page) {
  await page.route(/\/admin\/api\/auth$/, async (route) => {
    const { password } = route.request().postDataJSON();
    if (password === PASSWORD) return route.fulfill({ json: { token: 'e2e-token', expires_in: 43200 } });
    return route.fulfill({ status: 403, json: { error: 'Invalid administrator password' } });
  });
}

test('a wrong password stays on the page, the right one opens the section you asked for', async ({ page }) => {
  await openAdmin(page, { token: false, signIn: true });
  await stubSignIn(page);
  await page.goto('/admin#/korty/devices');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%23%2Fkorty%2Fdevices/);

  const password = page.getByLabel('Hasło', { exact: true });
  await expect(password).toBeFocused();
  await password.fill('nope');
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowe hasło administratora.');
  await expect(password).toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Pokaż hasło' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ukryj hasło' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  await password.fill(PASSWORD);
  await password.press('Enter');
  await expect(page).toHaveURL(/\/admin#\/korty\/devices$/);
  await expect(page.locator('.adm-rail__item').first()).toBeVisible();
});

test('signing out lands on the sign-in page and says so', async ({ page }) => {
  await openAdmin(page);
  await page.locator('.adm-top').getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/admin\/login\?reason=out$/);
  await expect(page.getByRole('status')).toHaveText('Wylogowano z tego urządzenia.');
  // and the panel does not let you back in without the password
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('an expired session sends you to sign in again, then back to the same section', async ({ page }) => {
  await openAdmin(page);
  await stubSignIn(page);
  await page.route(/\/admin\/api\/tournaments(\?|$)/, (route) => route.fulfill({ status: 401, json: { error: 'Administrator session expired' } }));
  await page.goto('/admin#/korty/courts');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%23%2Fkorty%2Fcourts&reason=expired$/);
  await expect(page.getByRole('status')).toHaveText('Sesja administratora wygasła. Zaloguj się ponownie.');
});

test('the sign-in page passes axe and fits a phone', async ({ page }) => {
  await openAdmin(page, { token: false, signIn: true });
  await expect(page.getByRole('heading', { name: 'Panel administratora' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  // the office is one tap away, in the brand panel on a desk, under the form on a phone
  await expect(page.getByRole('link', { name: /biura turnieju|Biuro turnieju/ }).filter({ visible: true })).toHaveAttribute('href', '/office');
});

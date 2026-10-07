/**
 * The organizer's side speaks the site's seven languages: the sign-in page picks one and
 * remembers it, an invitation opens in the person's language, the panel follows the account
 * and saves a change of language on it.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ME = (language) => ({
  contact_email: 'organizers@blindtennis.app',
  account: { id: 5, email: 'organizer@example.org', language },
  series: [{ id: 1, name: 'Takei World Tennis Tour', slug: 'twt', role: 'owner', valid_until: '2099-12-31', max_tournaments_per_year: 6, max_courts: 0,
    tournaments: [{ id: 28, name: '5th Dürener Handicup 2026', start_date: '2026-07-17', end_date: '2026-07-19', city: 'Düren', country: 'DE', tier: 'CH50', is_public: 1 },
      { id: 31, name: 'IBTA WBTC 2026', start_date: '2026-08-25', end_date: '2026-08-29', city: 'Wilno', country: 'LT', tier: '500', is_public: 1 }] }],
});

async function mock(page, { language = 'de', puts = [] } = {}) {
  await page.route(/\/organizer\/api\/invite\/de$/, (route) => (route.request().method() === 'GET'
    ? route.fulfill({ json: { email: 'organizer@example.org', language: 'de', series: ['Takei World Tennis Tour'], min_length: 10 } })
    : route.fulfill({ json: { token: 'org-token' } })));
  await page.route(/\/organizer\/api\/contact$/, (route) => route.fulfill({ json: { contact_email: 'organizers@blindtennis.app' } }));
  await page.route(/\/organizer\/api\/invite\/fr$/, (route) => route.fulfill({ json: { email: 'jean@example.org', language: 'fr', series: ['Takei World Tennis Tour'], min_length: 10 } }));
  await page.route(/\/organizer\/api\/me$/, (route) => {
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON());
      return route.fulfill({ json: route.request().postDataJSON() });
    }
    return route.fulfill({ json: ME(language) });
  });
}

test('the sign-in page switches language at once and remembers it', async ({ page }) => {
  await mock(page);
  await page.goto('/organizer/login?lang=en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organizer panel');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('#organizerForgot')).toContainText('organizers@blindtennis.app');
  await page.getByLabel('Language').selectOption('de');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Veranstalterbereich');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('button', { name: 'Passwort anzeigen' })).toBeVisible();
  await page.goto('/organizer/login');
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
});

test('an invitation opens in the language the admin chose for the person', async ({ page }) => {
  await mock(page);
  await page.goto('/organizer/invite?token=fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Définissez votre mot de passe');
  await expect(page.getByLabel('Nouveau mot de passe')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Définir le mot de passe et entrer' })).toBeVisible();
  await page.getByRole('button', { name: 'Définir le mot de passe et entrer' }).click();
  await expect(page.getByRole('alert')).toHaveText('Le mot de passe doit comporter au moins 10 caractères.');
});

test('the panel speaks the account language, and a switch is saved on the account', async ({ page }) => {
  const puts = [];
  await mock(page, { language: 'de', puts });
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); sessionStorage.setItem('wyniki-organizer-token', 'org-token'); } });
  await page.goto('/organizer');
  await expect(page.getByRole('heading', { name: 'Turniere der Serie' })).toBeVisible();
  await expect(page.locator('#org-tournaments-title + .adm-card__hint')).toHaveText('2 Turniere');
  await expect(page.locator('.org-facts')).toContainText('Inhaber');

  await page.getByLabel('Sprache').selectOption('lt');
  await expect(page.getByRole('heading', { name: 'Serijos turnyrai' })).toBeVisible();
  await expect(page.locator('#org-tournaments-title + .adm-card__hint')).toHaveText('2 turnyrai');
  await expect(page.locator('html')).toHaveAttribute('lang', 'lt');
  expect(puts).toEqual([{ language: 'lt' }]);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});

test('a link from an English mail opens English, and the panel stays English after the password', async ({ page }) => {
  const puts = [];
  await mock(page, { language: 'de', puts });
  await page.goto('/organizer/invite?token=de&lang=en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set your password');
  await page.getByLabel('New password').fill('a-long-enough-password');
  await page.getByLabel('Repeat the password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Set the password and enter' }).click();
  await expect(page.getByRole('heading', { name: 'Series tournaments' })).toBeVisible();
  expect(puts).toEqual([{ language: 'en' }]);
});

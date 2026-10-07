/**
 * Turnieje → Serie i konta: a series, the people who run it, its tournaments with their tier.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openAdmin, openSection } from './helpers.js';

const TWT = {
  id: 1, name: 'Takei World Tennis Tour', slug: 'twt', country: '', website: 'https://takeitour.com', valid_until: '2027-10-31',
  members: [{ id: 5, email: 'organizer@example.org', name: 'Jan Testowy', role: 'owner', disabled: 0, has_password: 0 }],
  tournaments: [{ id: 28, name: '5th Dürener Handicup 2026', start_date: '2026-07-17', end_date: '2026-07-19', city: 'Düren', tier: 'CH50' }],
};

async function openSeries(page, options = {}) {
  const requests = [];
  await openAdmin(page, { series: [TWT], onRequest: (request) => requests.push(request), ...options });
  await page.route(/\/admin\/api\/series\/1\/members$/, (route) => requests.push({ method: 'POST', url: route.request().url(), body: route.request().postDataJSON() }) && route.fulfill({
    status: 201,
    json: { account: { id: 6, email: 'anna@example.org' }, invite_url: 'https://test.blindtennis.app/organizer/invite?token=abc', emailed: false },
  }));
  await openSection(page, 'turnieje/series', 'Turnieje');
  return requests;
}

test('a series shows its people with their state and its tournaments with their tier', async ({ page }) => {
  await openSeries(page);
  await expect(page.getByRole('tab', { name: 'Serie i konta' })).toHaveAttribute('aria-selected', 'true');
  const card = page.getByRole('region', { name: 'Seria Takei World Tennis Tour' });
  await expect(card.locator('.adm-row').filter({ hasText: 'organizer@example.org' })).toContainText('czeka na ustawienie hasła');
  await expect(card.getByLabel('Ranga: 5th Dürener Handicup 2026')).toHaveValue('CH50');
  // tournaments already in the series are not offered again
  await expect(card.getByLabel('Turniej do dodania').locator('option')).not.toContainText(['Dürener']);
});

test('adding a person shows the invitation link to pass on when no mail went out', async ({ page }) => {
  const requests = await openSeries(page);
  const card = page.getByRole('region', { name: 'Seria Takei World Tennis Tour' });
  await card.getByLabel('E-mail osoby').fill('anna@example.org');
  await card.getByLabel('Imię i nazwisko').fill('Anna');
  await card.getByRole('button', { name: 'Dodaj i zaproś' }).click();
  const invite = page.getByRole('region', { name: /Zaproszenie dla anna@example.org/ });
  await expect(invite).toContainText('Mail nie wyszedł');
  await expect(invite.getByLabel('Link zaproszenia')).toHaveValue(/organizer\/invite\?token=abc/);
  expect(requests.find((r) => r.method === 'POST' && r.url.endsWith('/series/1/members'))?.body)
    .toEqual({ email: 'anna@example.org', name: 'Anna', role: 'editor', language: 'en' });
});

test('a tournament joins the series with its tier', async ({ page }) => {
  const requests = await openSeries(page);
  const card = page.getByRole('region', { name: 'Seria Takei World Tennis Tour' });
  await card.getByLabel('Turniej do dodania').selectOption({ label: 'IBTA World Blind Tennis Championships 2026 (27–29.08.2026)' });
  await card.getByLabel('Ranga', { exact: true }).selectOption('500');
  await card.getByRole('button', { name: 'Dodaj do serii' }).click();
  await expect.poll(() => requests.find((r) => r.method === 'PUT' && r.url.endsWith('/series/1/tournaments/31'))?.body).toEqual({ tier: '500' });
});

test('the series tab passes axe', async ({ page }) => {
  await openSeries(page);
  const results = await new AxeBuilder({ page }).include('#admin-series')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});


test('limits and the contact address are saved from the series tab', async ({ page }) => {
  const requests = await openSeries(page);
  const card = page.getByRole('region', { name: 'Seria Takei World Tennis Tour' });
  await card.getByLabel('Turnieje na rok (0 = bez limitu)').fill('6');
  await card.getByLabel('Korty w turnieju (0 = bez limitu)').fill('4');
  await card.getByRole('button', { name: 'Zapisz serię' }).click();
  await expect.poll(() => requests.find((r) => r.method === 'PATCH' && r.url.endsWith('/series/1'))?.body)
    .toMatchObject({ max_tournaments_per_year: 6, max_courts: 4 });
  await page.getByLabel('Adres kontaktowy dla organizatorów').fill('organizers@blindtennis.app');
  await page.getByRole('button', { name: 'Zapisz adres' }).click();
  await expect.poll(() => requests.find((r) => r.method === 'PUT' && r.url.endsWith('/series/settings'))?.body)
    .toEqual({ contact_email: 'organizers@blindtennis.app' });
});

test('a series logo goes up in both versions, each on its own ground, and comes down', async ({ page }) => {
  const requests = await openSeries(page);
  await page.route(/\/admin\/api\/series\/1\/logo(\?variant=dark)?$/, (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url() });
    const field = request.url().endsWith('variant=dark') ? 'logo_dark_path' : 'logo_path';
    return route.fulfill({ json: { [field]: request.method() === 'POST' ? '/brand/blindtennis-logo-email.png' : '' } });
  });
  const card = page.getByRole('region', { name: 'Seria Takei World Tennis Tour' });
  await expect(card.locator('.adm-series-logo__none:visible')).toHaveCount(2);
  await card.getByLabel('Logo na ciemne tło').setInputFiles('public/brand/blindtennis-logo-email.png');
  await expect(card.getByRole('img', { name: 'Logo: Takei World Tennis Tour (na ciemne tło)' })).toBeVisible();
  await expect(card.locator('.adm-series-logo__frame--dark img')).toBeVisible();
  await expect(card.locator('.adm-series-logo__none:visible')).toHaveCount(1);
  await card.getByRole('button', { name: 'Usuń logo na ciemne tło: Takei World Tennis Tour' }).click();
  await expect(card.locator('.adm-series-logo__none:visible')).toHaveCount(2);
  expect(requests.filter((r) => /\/logo/.test(r.url)).map((r) => `${r.method} ${r.url.split('/logo')[1]}`)).toEqual(['POST ?variant=dark', 'DELETE ?variant=dark']);
});

test('a tournament organizer gets the tournaments they run, one tick each', async ({ page }) => {
  const requests = await openSeries(page);
  await page.route(/\/admin\/api\/series\/1\/members\/5$/, (route) => {
    requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ...TWT, members: [{ ...TWT.members[0], role: 'local' }] } });
  });
  const card = page.getByRole('region', { name: 'Seria Takei World Tennis Tour' });
  await expect(card.getByRole('group', { name: 'Turnieje, które ta osoba prowadzi' })).toBeHidden();
  await card.getByLabel('Rola: organizer@example.org').selectOption('local');
  const grant = card.getByRole('group', { name: 'Turnieje, które ta osoba prowadzi' });
  await expect(grant).toBeVisible();
  await expect(grant.getByText('Bez zaznaczonego turnieju ta osoba nie widzi żadnego.')).toBeVisible();
  await grant.getByLabel('5th Dürener Handicup 2026').check();
  await expect(grant.getByText('Bez zaznaczonego turnieju ta osoba nie widzi żadnego.')).toBeHidden();
  const patches = requests.filter((r) => r.method === 'PATCH').map((r) => r.body);
  expect(patches).toEqual([{ role: 'local' }, { tournament_ids: [28] }]);
});

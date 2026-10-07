/**
 * Turnieje → Serie i konta: a series, the people who run it, its tournaments with their tier.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openAdmin, openSection } from './helpers.js';

const TWT = {
  id: 1, name: 'Takei World Tennis Tour', slug: 'twt', country: '', website: 'https://takeitour.com', valid_until: '2027-10-31',
  members: [{ id: 5, email: 'ivan@takeitour.com', name: 'Ivan R. Deb', role: 'owner', disabled: 0, has_password: 0 }],
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
  await expect(card.locator('.adm-row').filter({ hasText: 'ivan@takeitour.com' })).toContainText('czeka na ustawienie hasła');
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
    .toEqual({ email: 'anna@example.org', name: 'Anna', role: 'editor' });
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

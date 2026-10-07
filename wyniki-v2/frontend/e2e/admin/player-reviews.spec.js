/**
 * What the admin keeps an eye on in the series panel: player edits by organizers, and
 * the lock that keeps a series tournament off the website.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openAdmin, openSection, TOURNAMENTS } from './helpers.js';

const REVIEW = {
  id: 4, global_player_id: 7, first_name: 'Mateusz', last_name: 'Ciborowski', account_email: 'organizer@example.org',
  before: { category: 'B3' }, after: { category: 'B2' }, status: 'pending', created_at: '2026-10-07T12:30:00Z',
};

test('an organizer’s change waits with its old value, and Cofnij asks the server to undo it', async ({ page }) => {
  const calls = [];
  await openAdmin(page, { reviews: [REVIEW], onRequest: (call) => calls.push(call) });
  await openSection(page, 'zawodnicy/player_reviews', 'Zawodnicy');
  const row = page.locator('#admin-player-reviews .adm-row');
  await expect(row).toContainText('Mateusz Ciborowski');
  await expect(row).toContainText('organizer@example.org');
  await expect(row.locator('del')).toHaveText('B3');
  await expect(row.locator('strong')).toHaveText('B2');
  await row.getByRole('button', { name: /^Cofnij/ }).click();
  await expect.poll(() => calls.some((call) => call.method === 'POST' && call.url.endsWith('/player-reviews/4/revert'))).toBe(true);
  const results = await new AxeBuilder({ page }).include('#admin-player-reviews').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('the publication lock switches the public flag off and sends the lock', async ({ page }) => {
  const calls = [];
  const locked = TOURNAMENTS.map((row) => (row.id === 32 ? { ...row, visibility_lock: 'private', is_public: 0 } : row));
  await openAdmin(page, { tournaments: locked, onRequest: (call) => calls.push(call) });
  await page.locator('#admin-tournaments-list .adm-row').first().getByRole('button', { name: 'Ustawienia' }).click();
  const settings = page.locator('#admin-tournament-settings');
  await expect(settings.getByRole('checkbox', { name: /Blokada publikacji/ })).toBeChecked();
  await expect(settings.getByRole('checkbox', { name: /Publiczny/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Zapisz turniej' }).click();
  await expect.poll(() => calls.find((call) => call.method === 'PUT' && call.url.includes('/tournaments/32'))?.body).toBeTruthy();
});

/** Turnieje: the list, its search, and the switch that decides which tournament the site shows. */
import { expect, test } from '@playwright/test';

import { openAdmin, TOURNAMENTS } from './helpers.js';

test('the running tournament is on top, with its state and the switch on', async ({ page }) => {
  await openAdmin(page);
  const rows = page.locator('#admin-tournaments-list .adm-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('.adm-row__name')).toHaveText('RAKIETY ATNiS VII');
  await expect(rows.first().locator('.adm-chip')).toHaveText('AKTYWNY');
  await expect(rows.first().locator('.adm-switch input')).toBeChecked();
  await expect(rows.first().locator('.adm-row__meta')).toHaveText('26.09–27.09 · Giebułtów, PL · 4 korty');
  await expect(rows.nth(2).locator('.adm-chip')).toHaveText('ARCHIWUM');
});

test('search narrows the list and says so when nothing matches', async ({ page }) => {
  await openAdmin(page);
  await page.getByPlaceholder('Szukaj turnieju').fill('wilno');
  await expect(page.locator('#admin-tournaments-list .adm-row')).toHaveCount(1);
  await expect(page.locator('#admin-tournaments-list .adm-row__name')).toContainText('IBTA');

  await page.getByPlaceholder('Szukaj turnieju').fill('nie ma takiego');
  await expect(page.locator('#admin-tournaments-list .adm-row')).toHaveCount(0);
  await expect(page.locator('#admin-tournaments-list .adm-empty')).toContainText('Żaden turniej nie pasuje');
});

test('the switch activates a tournament through the API', async ({ page }) => {
  const calls = [];
  await openAdmin(page, { onRequest: (call) => calls.push(call) });
  const wilno = page.locator('#admin-tournaments-list .adm-row').filter({ hasText: 'IBTA' });
  await wilno.locator('.adm-switch input').check();
  await expect.poll(() => calls.filter((call) => call.method === 'PUT' && call.url.includes('/tournaments/31/active')).length).toBe(1);
  const call = calls.find((item) => item.url.includes('/tournaments/31/active'));
  expect(call.body).toMatchObject({ active: true });
});

test('a tournament with no entries at all tells you where to start', async ({ page }) => {
  await openAdmin(page, { tournaments: [] });
  await expect(page.locator('#admin-tournaments-list .adm-empty')).toContainText('Nie ma jeszcze żadnego turnieju');
});

test('"Nowy turniej" opens a dialog that insists on a name and both dates', async ({ page }) => {
  const calls = [];
  await openAdmin(page, { onRequest: (call) => calls.push(call) });
  await page.getByRole('button', { name: 'Nowy turniej' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowy turniej' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#adm-new-name')).toBeFocused();

  await dialog.getByRole('button', { name: 'Utwórz turniej' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Nazwa i obie daty');
  expect(calls.filter((call) => call.method === 'POST')).toEqual([]);

  await page.locator('#adm-new-name').fill('Puchar Jesienny');
  await page.locator('#adm-new-start-date').fill('2026-11-07');
  await page.locator('#adm-new-end-date').fill('2026-11-08');
  await dialog.getByRole('button', { name: 'Utwórz turniej' }).click();
  await expect.poll(() => calls.filter((call) => call.method === 'POST' && call.url.endsWith('/admin/api/tournaments')).length).toBe(1);
  expect(calls.find((call) => call.method === 'POST').body).toContain('Puchar Jesienny');
});

test('the create dialog closes on Anuluj and on Escape, keeping nothing behind', async ({ page }) => {
  await openAdmin(page);
  const dialog = page.getByRole('dialog', { name: 'Nowy turniej' });
  await page.getByRole('button', { name: 'Nowy turniej' }).click();
  await dialog.getByRole('button', { name: 'Anuluj' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Nowy turniej' }).click();
  await page.locator('#adm-new-name').fill('Zapomniany');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Nowy turniej' }).click();
  await expect(page.locator('#adm-new-name')).toHaveValue('');
});

test('Ustawienia opens the tournament with its fields, flags and extras', async ({ page }) => {
  const calls = [];
  await openAdmin(page, { onRequest: (call) => calls.push(call) });
  await page.locator('#admin-tournaments-list .adm-row').first().getByRole('button', { name: 'Ustawienia' }).click();

  await expect(page.locator('#adm-edit-name')).toHaveValue('RAKIETY ATNiS VII');
  await expect(page.locator('#adm-edit-start-date')).toHaveValue('2026-09-26');
  await expect(page.locator('#adm-edit-court-count')).toHaveValue('4');
  const settings = page.locator('#admin-tournament-settings');
  await expect(settings.locator('.adm-flag')).toHaveCount(5);
  await expect(settings.locator('.adm-flag.is-on')).toHaveCount(3);
  await expect(page.getByText('Transmisje i kategorie')).toBeVisible();

  await page.getByRole('button', { name: 'Zapisz turniej' }).click();
  await expect.poll(() => calls.filter((call) => call.method === 'PUT' && call.url.includes('/tournaments/32')).length).toBeGreaterThan(0);
});

test('a simulation cannot be public: those two switches are off limits', async ({ page }) => {
  await openAdmin(page);
  await page.locator('#admin-tournaments-list .adm-row').filter({ hasText: 'App Review Access' }).getByRole('button', { name: 'Ustawienia' }).click();
  const flags = page.locator('#admin-tournament-settings .adm-flag');
  await expect(flags.filter({ hasText: 'Publiczny' }).locator('input')).toBeDisabled();
  await expect(flags.filter({ hasText: 'Liczy statystyki' }).locator('input')).toBeDisabled();
  await expect(flags.filter({ hasText: 'Symulacja' }).locator('input')).toBeEnabled();
});

test('every row control is a real target, at least 44 px tall', async ({ page }) => {
  await openAdmin(page);
  const small = await page.evaluate(() => [...document.querySelectorAll('#admin-tournaments-list .adm-row button, #admin-tournaments-list .adm-row input, #admin-tournaments-list .adm-card__actions button, #admin-tournaments-list .adm-card__actions input')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ el: el.className || el.tagName, h: Math.round(el.getBoundingClientRect().height) }))
    .filter((item) => item.h < 44));
  expect(small).toEqual([]);
  expect(TOURNAMENTS.length).toBe(3);
});

test('"Biuro" opens the real office for the tournament, not a copy inside the admin', async ({ page }) => {
  await openAdmin(page);
  const rows = page.locator('#admin-tournaments-list .adm-row');
  const running = rows.filter({ hasText: 'RAKIETY ATNiS VII' }).getByRole('link', { name: 'Biuro' });
  await expect(running).toHaveAttribute('href', /^\/office\/\d+$/);
  await expect(running).toHaveAttribute('target', '_blank');
  // A tournament that is switched off has no office to open.
  await expect(rows.filter({ hasText: 'IBTA World Blind Tennis Championships 2026' }).getByRole('link', { name: 'Biuro' })).toBeHidden();
  await expect(page.locator('#admin-office-tab')).toHaveCount(0);
});

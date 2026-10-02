/** Korty i tablety: the warning about guessable PINs, and handing out fresh ones. */
import { expect, test } from '@playwright/test';

import { openAdmin } from './helpers.js';

async function openCourts(page, options) {
  await openAdmin(page, options);
  await page.locator('.adm-rail__item', { hasText: 'Korty i tablety' }).click();
  await expect(page.locator('.adm-main__head h1')).toHaveText('Korty i tablety');
}

test('courts left on the default PIN are called out, in the banner and on the row', async ({ page }) => {
  await openCourts(page);
  await expect(page.locator('.adm-court__pininput.is-weak')).toHaveCount(2);
  const bar = page.locator('.adm-pinbar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('2');
  await expect(bar).toContainText('zgadnie każdy');
});

test('nothing is said when every court has its own PIN', async ({ page }) => {
  await openCourts(page, { courts: [{ kort_id: 't32-1', name: '1', pin: '8261', tournament_id: 32, active: 1 }] });
  await expect(page.locator('.adm-pinbar')).toBeHidden();
});

test('drawing PINs shows one per court, re-draws, and saves them one by one', async ({ page }) => {
  const calls = [];
  await openCourts(page, { onRequest: (call) => calls.push(call) });
  await page.locator('.adm-card__actions').getByRole('button', { name: 'Wylosuj nowe PIN-y' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowe PIN-y kortów' });
  await expect(dialog.locator('.adm-pin')).toHaveCount(3);
  const drawn = await dialog.locator('.adm-pin__value').allTextContents();
  expect(drawn.every((pin) => /^\d{4}$/.test(pin))).toBe(true);
  expect(new Set(drawn).size).toBe(3);
  await expect(dialog.locator('.adm-pin').first()).toContainText('było 0000');

  const reroll = dialog.getByRole('button', { name: 'Losuj ponownie' });
  await reroll.focus();
  await page.keyboard.press('Enter'); // mobile emulation mis-hits fixed overlays; the keyboard path is real too
  await expect.poll(async () => (await dialog.locator('.adm-pin__value').allTextContents()).join()).not.toBe(drawn.join());

  const save = dialog.getByRole('button', { name: /Zapisz PIN-y|Zapisuję/ });
  await save.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => calls.filter((call) => call.method === 'PUT' && call.url.includes('/courts/') && call.url.endsWith('/pin')).length).toBe(3);
  const saved = calls.filter((call) => call.url.endsWith('/pin')).map((call) => call.body.pin);
  expect(saved.every((pin) => /^\d{4}$/.test(pin))).toBe(true);
  await expect(dialog).toBeHidden();
});

test('the tablets sub-tab opens from the section', async ({ page }) => {
  await openCourts(page);
  await page.getByRole('tab', { name: 'Tablety' }).click();
  await expect(page).toHaveURL(/#\/korty\/devices$/);
  await expect(page.locator('#admin-devices-list .adm-card__title')).toHaveText('Tablety');
});

test('a court row shows what is being played and the tablet battery', async ({ page }) => {
  await openAdmin(page, {
    snapshot: {
      't32-1': {
        match_status: { active: true }, current_set: 1, battery_level: 17,
        A: { surname: 'Kokot', current_games: 2, points: '30', set1: 2 },
        B: { surname: 'Nowak', current_games: 1, points: '15', set1: 1 },
      },
    },
  });
  await page.locator('.adm-rail__item', { hasText: 'Korty i tablety' }).click();
  const row = page.locator('.adm-row').filter({ hasText: 'Kokot' });
  await expect(row.locator('.adm-chip--live')).toHaveText('W GRZE');
  await expect(row.locator('.adm-row__meta')).toContainText('2:1 (30:15)');
  await expect(row.locator('.adm-court__battery')).toHaveText('17%');
  await expect(row.locator('.adm-court__battery')).toHaveClass(/is-alert/);
});

test('tablets: new ones wait for a name, the named fleet shows court, version and battery', async ({ page }) => {
  const calls = [];
  await openAdmin(page, { onRequest: (call) => calls.push(call) });
  await page.locator('.adm-rail__item', { hasText: 'Korty i tablety' }).click();
  await page.getByRole('tab', { name: 'Tablety' }).click();

  const groups = page.locator('#admin-devices-list .adm-group');
  await expect(groups.first().locator('.adm-group__title')).toContainText('Nowe');
  await expect(groups.first().locator('.adm-row')).toHaveCount(1);
  await expect(groups.nth(1).locator('.adm-row')).toHaveCount(2);

  const low = page.locator('.adm-row').filter({ has: page.locator('#adm-dev-name-tab-3') });
  await expect(low.locator('.adm-row__meta')).toContainText('kort t32-3 · 1.0.0-dev.37');
  await expect(low.locator('.adm-court__battery')).toHaveClass(/is-alert/);

  const fresh = page.locator('.adm-row').filter({ has: page.locator('#adm-dev-name-new-1') });
  await page.locator('#adm-dev-name-new-1').fill('Tablet 5');
  await fresh.getByRole('button', { name: 'Nazwij' }).click();
  await expect.poll(() => calls.filter((call) => call.method === 'PUT' && call.url.includes('/admin/api/devices/')).length).toBe(1);
  expect(calls.find((call) => call.url.includes('/admin/api/devices/')).body).toMatchObject({ name: 'Tablet 5' });
});

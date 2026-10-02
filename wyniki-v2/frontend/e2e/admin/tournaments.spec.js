/** Turnieje: the list, its search, and the switch that decides which tournament the site shows. */
import { expect, test } from '@playwright/test';

import { openAdmin, TOURNAMENTS } from './helpers.js';

test('the running tournament is on top, with its state and the switch on', async ({ page }) => {
  await openAdmin(page);
  const rows = page.locator('.adm-row');
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
  await expect(page.locator('.adm-row')).toHaveCount(1);
  await expect(page.locator('.adm-row__name')).toContainText('IBTA');

  await page.getByPlaceholder('Szukaj turnieju').fill('nie ma takiego');
  await expect(page.locator('.adm-row')).toHaveCount(0);
  await expect(page.locator('.adm-empty')).toContainText('Żaden turniej nie pasuje');
});

test('the switch activates a tournament through the API', async ({ page }) => {
  const calls = [];
  await openAdmin(page, { onRequest: (call) => calls.push(call) });
  const wilno = page.locator('.adm-row').filter({ hasText: 'IBTA' });
  await wilno.locator('.adm-switch input').check();
  await expect.poll(() => calls.filter((call) => call.method === 'PUT' && call.url.includes('/tournaments/31/active')).length).toBe(1);
  const call = calls.find((item) => item.url.includes('/tournaments/31/active'));
  expect(call.body).toMatchObject({ active: true });
});

test('a tournament with no entries at all tells you where to start', async ({ page }) => {
  await openAdmin(page, { tournaments: [] });
  await expect(page.locator('.adm-empty')).toContainText('Nie ma jeszcze żadnego turnieju');
});

test('"Nowy turniej" jumps to the create form', async ({ page }) => {
  await openAdmin(page);
  await page.getByRole('button', { name: 'Nowy turniej' }).click();
  const heading = page.locator('#adm-new-tournament');
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
});

test('every row control is a real target, at least 44 px tall', async ({ page }) => {
  await openAdmin(page);
  const small = await page.evaluate(() => [...document.querySelectorAll('.adm-row button, .adm-row input, .adm-card__actions button, .adm-card__actions input')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ el: el.className || el.tagName, h: Math.round(el.getBoundingClientRect().height) }))
    .filter((item) => item.h < 44));
  expect(small).toEqual([]);
  expect(TOURNAMENTS.length).toBe(3);
});

/** Zawodnicy: the shared base, who is already entered, and adding someone to a tournament. */
import { expect, test } from '@playwright/test';

import { openAdmin } from './helpers.js';

async function openPlayers(page, options) {
  await openAdmin(page, options);
  await page.locator('.adm-rail__item', { hasText: 'Zawodnicy' }).click();
  await expect(page.locator('#admin-players-base .adm-row').first()).toBeVisible();
}

test('the base lists players with class, country and how many tournaments they played', async ({ page }) => {
  await openPlayers(page);
  const rows = page.locator('#admin-players-base .adm-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('.adm-row__name')).toHaveText('Mateusz Ciborowski');
  await expect(rows.first().locator('.adm-row__meta')).toContainText('PL · B2');
});

test('without a tournament picked nobody can be added; picking one opens the button', async ({ page }) => {
  await openPlayers(page);
  await page.locator('#adm-players-tournament').selectOption('');
  await expect(page.locator('#admin-players-base .adm-row__actions button:visible').filter({ hasText: 'Dopisz' })).toHaveCount(0);

  await page.locator('#adm-players-tournament').selectOption('32');
  await expect(page.locator('#admin-players-base .adm-chip--ok:visible')).toHaveCount(1);
  // The phone bar has no room for the tournament name, so there the button says just "Dopisz".
  const label = test.info().project.name === 'phone' ? 'Dopisz' : 'Dopisz do: RAKIETY ATNiS VII';
  const addButtons = page.locator('#admin-players-base .adm-row__actions button:visible').filter({ hasText: label });
  await expect(addButtons).toHaveCount(2);
});

test('adding a player to the tournament goes through the API', async ({ page }) => {
  const calls = [];
  await openPlayers(page, { onRequest: (call) => calls.push(call) });
  await page.locator('#adm-players-tournament').selectOption('32');
  await page.locator('#admin-players-base .adm-row').filter({ hasText: 'Zgrzebska' }).getByRole('button', { name: /Dopisz/ }).click();
  await expect.poll(() => calls.filter((call) => call.method === 'POST' && call.url.includes('add-global')).length).toBe(1);
  expect(calls.find((call) => call.url.includes('add-global')).body).toMatchObject({ global_player_id: 11 });
});

test('"Dodaj zawodnika" asks for a last name and nothing else', async ({ page }) => {
  const calls = [];
  await openPlayers(page, { onRequest: (call) => calls.push(call) });
  await page.getByRole('button', { name: 'Dodaj zawodnika' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowy zawodnik w bazie' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#adm-player-last-name')).toBeFocused();

  // The dialog's buttons must be fully on screen and on top — a phone's bottom bar used to cover them.
  const save = dialog.getByRole('button', { name: 'Zapisz zawodnika' });
  const reachable = await save.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const onTop = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
    return { onTop, inside: rect.top >= 0 && rect.bottom <= window.innerHeight, height: Math.round(rect.height) };
  });
  expect(reachable).toEqual({ onTop: true, inside: true, height: 44 });

  // Pressing the focused button is the keyboard path; mobile emulation mis-hits fixed overlays.
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Nazwisko');
  expect(calls.filter((call) => call.method === 'POST' && call.url.endsWith('/global-players'))).toEqual([]);

  await page.locator('#adm-player-last-name').fill('Kowalczyk');
  await save.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => calls.filter((call) => call.method === 'POST' && call.url.endsWith('/global-players')).length).toBe(1);
});

test('the empty state explains itself when filters match nobody', async ({ page }) => {
  await openAdmin(page, { players: [] });
  await page.locator('.adm-rail__item', { hasText: 'Zawodnicy' }).click();
  await expect(page.locator('#admin-players-base .adm-empty')).toContainText('Nikt nie pasuje do filtrów');
});

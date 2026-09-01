import { expect, test } from '@playwright/test';
import { enterPin, mockUmpireApi, openUmpire, seedLanguage, todayKey } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await mockUmpireApi(page);
});

test('10 language picker is the first screen', async ({ page }) => {
  await openUmpire(page);
  await expect(page.locator('h1.ump-title')).toHaveText('Choose language');
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Polski/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
  await expect(page.evaluate(() => getComputedStyle(document.body).overflow)).resolves.toBe('hidden');
  const { width, height } = page.viewportSize();
  expect([800, 1280]).toContain(width);
  expect([800, 1280]).toContain(height);
});

test('11 tournament list after language', async ({ page }) => {
  await openUmpire(page);
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Choose tournament');
  await expect(page.getByRole('button', { name: 'Vilnius E2E' })).toBeVisible();
});

test('12 court list and settings gear', async ({ page }) => {
  await seedLanguage(page, 'en');
  await page.addInitScript((day) => {
    localStorage.setItem('umpire.selected_tournament', JSON.stringify({
      id: 31,
      name: 'Vilnius E2E',
      day,
    }));
  }, todayKey());
  await openUmpire(page, '#/court');
  await expect(page.locator('h1.ump-title')).toHaveText('Choose court');
  await expect(page.getByRole('button', { name: 'Court 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('13 PIN pad accepts four digits', async ({ page }) => {
  await seedLanguage(page, 'en');
  await page.addInitScript((day) => {
    localStorage.setItem('umpire.selected_tournament', JSON.stringify({
      id: 31,
      name: 'Vilnius E2E',
      day,
    }));
  }, todayKey());
  await openUmpire(page, '#/court');
  await page.getByRole('button', { name: 'Court 1' }).click();
  await expect(page.getByRole('heading', { name: 'Court PIN' })).toBeVisible();
  await enterPin(page, '1234');
  await expect(page.locator('h1.ump-title')).toHaveText('Choose players');
});

test('14–15 pick two players and open match setup', async ({ page }) => {
  await seedLanguage(page, 'en');
  await page.addInitScript((payload) => {
    localStorage.setItem('umpire.selected_tournament', JSON.stringify(payload.tournament));
    localStorage.setItem('umpire.court_session', JSON.stringify(payload.court));
  }, {
    tournament: { id: 31, name: 'Vilnius E2E', day: todayKey() },
    court: {
      courtId: 't31-1',
      courtName: 'Court 1',
      token: 'e2e-token',
      expiresAtMillis: Date.now() + 3_600_000,
    },
  });
  await openUmpire(page, '#/players');
  await expect(page.getByRole('button', { name: 'Singles' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Doubles' })).toBeVisible();
  await expect(page.getByText('Select 2 players to continue.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
  const searchBox = page.locator('.ump-search-row .ump-search');
  const addBtn = page.getByRole('button', { name: 'Add player' });
  await expect(searchBox).toBeVisible();
  await expect(addBtn).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
  await expect(page.locator('section.ump-screen').filter({ hasText: 'Kowalski' }).locator('.ump-scroll.ump-list')).toBeVisible();
  const searchBoxY = (await searchBox.boundingBox()).y;
  const addBtnY = (await addBtn.boundingBox()).y;
  expect(Math.abs(searchBoxY - addBtnY)).toBeLessThan(12);
  await page.getByRole('button', { name: 'Doubles' }).click();
  await expect(page.getByText('Select 4 players to continue.')).toBeVisible();
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await expect(page.locator('.ump-player.is-team1')).toHaveCount(2);
  await page.getByRole('button', { name: 'Lis' }).click();
  await expect(page.locator('.ump-player.is-team2')).toHaveCount(1);
  await page.getByRole('button', { name: 'Singles' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Match setup', { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'Basic' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Advanced' })).toBeVisible();
});

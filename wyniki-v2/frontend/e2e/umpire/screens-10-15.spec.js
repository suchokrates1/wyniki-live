import { expect, test } from '@playwright/test';
import { enterPin, mockUmpireApi, openUmpire, seedLanguage, todayKey } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await mockUmpireApi(page);
});

test('10 language picker is the first screen', async ({ page }) => {
  await openUmpire(page);
  await expect(page.locator('h1.ump-title')).toHaveText('Select Language');
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
  await expect(page.locator('h1.ump-title')).toHaveText('Select Tournament');
  await expect(page.getByRole('button', { name: 'Vilnius E2E' })).toBeVisible();
});

test('12 court list and settings gear', async ({ page }) => {
  await mockUmpireApi(page, {
    courts: [
      { kort_id: 't31-1', name: 'Court 1', is_available: true },
      { kort_id: 't31-2', name: 'Court 2', is_available: false },
      { kort_id: 't31-3', name: 'Court 3', is_available: true },
    ],
  });
  await seedLanguage(page, 'en');
  await page.addInitScript((day) => {
    localStorage.setItem('umpire.selected_tournament', JSON.stringify({
      id: 31,
      name: 'Vilnius E2E',
      day,
    }));
  }, todayKey());
  await openUmpire(page, '#/court');
  await expect(page.locator('h1.ump-title')).toHaveText('Select Court');
  await expect(page.getByRole('button', { name: 'Court 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  const cols = await page.locator('.ump-courts').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(cols.split(' ').filter(Boolean)).toHaveLength(2);
  const first = await page.getByRole('button', { name: /Court 1/ }).boundingBox();
  const second = await page.getByRole('button', { name: /Court 2/ }).boundingBox();
  expect(first.width).toBeGreaterThan(80);
  expect(Math.abs(first.width - first.height) / first.width).toBeLessThan(0.12);
  expect(second.x).toBeGreaterThan(first.x + first.width / 2);
  expect(Math.abs(first.y - second.y)).toBeLessThan(12);
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
  await expect(page.getByRole('heading', { name: 'Court Authorization' })).toBeVisible();
  await enterPin(page, '1234');
  await expect(page.locator('h1.ump-title')).toHaveText('Select Players');
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
  await expect(page.getByText('Singles (2 players)')).toBeVisible();
  await expect(page.getByText('Selected: 0/2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
  const searchBox = page.locator('.ump-search-row .ump-search');
  const addBtn = page.getByRole('button', { name: '+ Add new player' });
  await expect(searchBox).toBeVisible();
  await expect(addBtn).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
  await expect(page.locator('section.ump-screen').filter({ hasText: 'Kowalski' }).locator('.ump-scroll.ump-list')).toBeVisible();
  const searchBoxY = (await searchBox.boundingBox()).y;
  const addBtnY = (await addBtn.boundingBox()).y;
  expect(Math.abs(searchBoxY - addBtnY)).toBeLessThan(12);
  await page.getByRole('button', { name: 'Doubles' }).click();
  await expect(page.getByText('Selected: 0/4')).toBeVisible();
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await expect(page.locator('.ump-player.is-team1')).toHaveCount(2);
  await page.getByRole('button', { name: 'Lis' }).click();
  await expect(page.locator('.ump-player.is-team2')).toHaveCount(1);
  await page.getByRole('button', { name: 'Singles' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Match Setup', { timeout: 5_000 });
  await expect(page.locator('.ump-scroll.ump-config')).toHaveCount(0);
  const configOverflow = await page.locator('.ump-config').evaluate((el) => getComputedStyle(el).overflowY);
  expect(['hidden', 'clip']).toContain(configOverflow);
  await expect(page.getByRole('switch', { name: 'Advanced' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Tiebreak Only' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'No-Advantage (Deciding Point)' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Sets to win' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Match tiebreak to' })).toBeVisible();
  await page.getByRole('group', { name: 'Sets to win' }).getByRole('button', { name: '1' }).click();
  await expect(page.getByRole('group', { name: 'Match tiebreak to' })).toBeHidden();
  await page.getByRole('group', { name: 'Sets to win' }).getByRole('button', { name: '3' }).click();
  await expect(page.getByRole('group', { name: 'Match tiebreak to' })).toBeVisible();
  await page.getByRole('switch', { name: 'Tiebreak Only' }).click();
  await expect(page.getByRole('group', { name: 'Games per set' })).toBeHidden();
  await expect(page.getByRole('group', { name: 'Tiebreak to' }).first()).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { mockUmpireApi, openUmpire, seedThroughCourt } from './helpers.js';

async function startBasicMatch(page) {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Match setup', { timeout: 5_000 });
  await page.locator('.ump-mode').filter({ hasText: 'Basic' }).click();
  await expect(page.getByRole('button', { name: /Kowalski/ })).toBeVisible();
  await page.getByRole('button', { name: /Kowalski/ }).first().click();
}

test('16–17–19 Basic chrome, server, and WIN to 15', async ({ page }) => {
  await startBasicMatch(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  const finish = page.getByRole('button', { name: 'Finish Match' });
  await expect(undo).toBeVisible();
  await expect(finish).toBeVisible();
  await expect(page.locator('.ump-top__actions').getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(page.locator('.ump-board__timer')).toBeVisible();
  await expect(page.locator('.ump-board__serve.is-on .ump-ball')).toBeVisible();
  await expect(page.locator('.ump-board__name').first()).toContainText('Kowalski');
  const undoBox = await undo.boundingBox();
  const finishBox = await finish.boundingBox();
  const winBox = await page.locator('.ump-win').first().boundingBox();
  expect(undoBox.y).toBeGreaterThan(winBox.y);
  expect(finishBox.y).toBeGreaterThan(undoBox.y);
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('15');
});

test('18 Advanced ACE scores 15', async ({ page }) => {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Match setup', { timeout: 5_000 });
  await page.locator('.ump-mode').filter({ hasText: 'Advanced' }).click();
  await page.getByRole('button', { name: /Kowalski/ }).first().click();
  await page.getByRole('button', { name: 'ACE' }).first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('15');
});

test('20–21 announcement continue and Test finish hides Undo', async ({ page }) => {
  await startBasicMatch(page);
  for (let i = 0; i < 4; i += 1) {
    const announce = page.locator('.ump-announce');
    if (await announce.isVisible()) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await page.locator('.ump-win').first().click();
  }
  const announce = page.locator('.ump-announce');
  if (await announce.isVisible()) {
    await expect(announce.getByRole('heading')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Why are you ending this match?')).toBeVisible();
  await page.getByRole('button', { name: 'Test entry' }).click();
  await expect(page.getByRole('heading', { name: 'Match Finished!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next match — same setup' })).toBeVisible();
});

test('22 settings language and theme', async ({ page }) => {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/settings');
  await expect(page.locator('h1.ump-title')).toHaveText('Settings');
  await page.getByRole('button', { name: 'Light' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.getByRole('button', { name: /Deutsch/ }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Einstellungen');
});

test('23 history starts empty', async ({ page }) => {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/history');
  await expect(page.getByText('No matches yet.')).toBeVisible();
});

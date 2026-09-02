import { expect, test } from '@playwright/test';
import { mockUmpireApi, openUmpire, seedLanguage } from './helpers.js';

test('Tutorial settings starts sandbox and never POSTs matches', async ({ page }) => {
  const matchPosts = [];
  await seedLanguage(page, 'en');
  await mockUmpireApi(page);
  await page.route('**/api/matches**', async (route) => {
    if (route.request().method() === 'POST') matchPosts.push(route.request().url());
    return route.fulfill({ json: { id: 99 } });
  });
  await openUmpire(page, '#/settings');
  await page.getByTestId('tutorial-start').click();
  await expect(page.locator('.ump-guide__card')).toBeVisible();
  const guide = page.locator('.ump-guide__card');
  await expect(guide.getByRole('heading', { name: 'Pick your court' })).toBeVisible();
  await page.locator('[data-tutorial="court1"]').click();
  await expect(guide.getByRole('heading', { name: 'Court PIN' })).toBeVisible();
  for (const digit of ['1', '2', '3', '4']) {
    await page.locator('.ump-pad').getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(guide.getByRole('heading', { name: 'Select the two players' })).toBeVisible();
  await page.getByRole('button', { name: /Costa/ }).click();
  await page.getByRole('button', { name: /Nowak/ }).click();
  await expect(guide.getByRole('heading', { name: 'Match setup' })).toBeVisible();
  await page.locator('[data-tutorial="configNext"]').click();
  await expect(guide.getByRole('heading', { name: 'Match the court sides' })).toBeVisible();
  await page.locator('[data-tutorial="swapSides"]').click();
  await expect(guide.getByRole('heading', { name: 'Who serves first?' })).toBeVisible();
  await page.locator('[data-tutorial="chooseServer"]').first().click();
  await expect(guide.getByRole('heading', { name: 'Award the point' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Double fault' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Change of ends' })).toBeVisible();
  expect(matchPosts).toEqual([]);
});

test('Tutorial first-run banner can be dismissed', async ({ page }) => {
  await mockUmpireApi(page);
  await openUmpire(page, '', { keepTutorialBanner: true });
  await expect(page.getByTestId('tutorial-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.getByTestId('tutorial-banner')).toBeHidden();
});

/**
 * The redesigned results: days of bracket match cards, day buttons, search, details.
 */
import { expect, test } from '@playwright/test';
import { noSidewaysScroll, open, tournaments, watchErrors } from './helpers.js';

test('a tournament\'s results come in days of cards; a day button and the search narrow them', async ({ page }) => {
  const errors = watchErrors(page);
  const { big } = await tournaments(page);
  await open(page, `tournaments/${big.id}/matches`);
  const results = page.locator('#panel-main-tournaments .rsv');
  await expect(results.locator('.rsv-day-section').first()).toBeVisible();
  const days = await results.locator('.rsv-day-section').count();
  expect(days, 'one section per day').toBeGreaterThanOrEqual(5);

  const card = results.locator('.rsv-item').first();
  await expect(card.locator('.btv-row')).toHaveCount(2);
  await expect(card.locator('.btv-row.is-won'), 'one winner per card').toHaveCount(1);
  await expect(card.locator('.hm-court-badge')).toContainText('Kort');

  const day = results.locator('.rsv-day', { hasText: '29' }).first();
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(results.locator('.rsv-day-section')).toHaveCount(1);

  await results.locator('input[type="search"]').fill('Kallunki');
  const found = results.locator('.rsv-item');
  await expect(found.first()).toBeVisible();
  for (const text of await found.allTextContents()) expect(text).toContain('Kallunki');

  await results.locator('.rsv-filters .filter-btn').click();
  await expect(results.locator('.rsv-day').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(results.locator('.rsv-day-section')).toHaveCount(days);
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('a final in the results: the winner bold, a gold round label, details open and close', async ({ page }) => {
  const { big } = await tournaments(page);
  await open(page, `tournaments/${big.id}/matches`);
  const results = page.locator('#panel-main-tournaments .rsv');
  await results.locator('input[type="search"]').fill('Kallunki');
  const final = results.locator('.rsv-item').filter({ has: page.locator('.rsv-phase.is-medal') }).filter({ hasText: 'Naqi Rizvi' }).first();
  await expect(final.locator('.btv-row.is-won')).toContainText('Jani Kallunki');
  const details = final.locator('.hm-details-btn');
  if (await details.count()) {
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'false');
  }
});

test('the live history uses the same list', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'live/history');
  const live = page.locator('#panel-live-history');
  const empty = live.locator('.empty-state');
  if (await live.locator('.rsv').count()) {
    await expect(live.locator('.rsv-day-section').first()).toBeVisible();
    await expect(live.locator('.rsv-item').first().locator('.btv-row')).toHaveCount(2);
  } else {
    await expect(empty.first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

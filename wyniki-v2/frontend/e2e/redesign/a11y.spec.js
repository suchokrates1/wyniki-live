/**
 * Axe on the redesigned views, in the project's theme (light, or dark for desktop-dark and
 * the dark preference): the bracket with a pinned player and every fold open, a profile, results.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bracketOf, open, tournaments } from './helpers.js';

async function axe(page, selector) {
  const result = await new AxeBuilder({ page }).include(selector).analyze();
  return result.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`);
}

function themeOf(testInfo) {
  return testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light';
}

test('the bracket passes axe with a pin and everything unfolded', async ({ page }, testInfo) => {
  const { big } = await tournaments(page);
  await open(page, `tournaments/${big.id}/bracket/B1 Men?pin=Rafał Sudoł`, { theme: themeOf(testInfo) });
  await page.locator('#tcat-panel-B1-Men details').evaluateAll((els) => els.forEach((el) => { el.open = true; }));
  expect(await axe(page, '#tcat-panel-B1-Men')).toEqual([]);
});

test('a profile passes axe', async ({ page }, testInfo) => {
  const { big } = await tournaments(page);
  const entry = (await bracketOf(page, big.id)).players['Rafał Sudoł'];
  await open(page, `players/global/${entry.global_player_id}`, { theme: themeOf(testInfo) });
  await page.locator('.pfv-tournament').evaluateAll((els) => els.forEach((el) => { el.open = true; }));
  await expect(page.locator('.pfv-match').first()).toBeVisible();
  expect(await axe(page, '.pfv')).toEqual([]);
});

test('results pass axe', async ({ page }, testInfo) => {
  const { big } = await tournaments(page);
  await open(page, `tournaments/${big.id}/matches`, { theme: themeOf(testInfo) });
  await page.locator('#panel-main-tournaments .rsv input[type="search"]').fill('Kallunki');
  await expect(page.locator('#panel-main-tournaments .rsv-item').first()).toBeVisible();
  expect(await axe(page, '#panel-main-tournaments .rsv')).toEqual([]);
});

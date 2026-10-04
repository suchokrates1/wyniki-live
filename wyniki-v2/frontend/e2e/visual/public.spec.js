/**
 * What the public site looks like. One picture per view; a diff means a stylesheet
 * changed something, and the person who changed it decides whether that was the point.
 */
import { expect, test } from '@playwright/test';

const ROUTES = [
  ['live-scores', 'live/scores'],
  ['live-bracket', 'live/bracket'],
  ['live-schedule', 'live/schedule'],
  ['live-history', 'live/history'],
  ['tournaments', 'tournaments'],
  ['players', 'players'],
];

/** Everything that would make two runs differ: the clock, the live feed, animation. */
async function settle(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  // The header clock and the "updated at" lines move on their own.
  await page.addStyleTag({
    content: '.header-time, .last-update, [data-live-clock] { visibility: hidden !important; }',
  });
  await page.waitForFunction(
    () => ![...document.querySelectorAll('.loading-state')].some((el) => el.offsetParent !== null),
    undefined,
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(400);
}

async function open(page, hash, { theme = 'light' } = {}) {
  await page.addInitScript((code) => {
    try {
      localStorage.setItem('lang', code);
      localStorage.setItem('analytics-consent', 'rejected');
    } catch { /* private mode */ }
  }, 'pl');
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`/?lang=pl#${hash}`);
  await expect(page.locator('.tab-bar')).toBeVisible();
  await settle(page);
}

for (const [name, hash] of ROUTES) {
  test(`${name} looks the way it looked`, async ({ page }) => {
    await open(page, hash);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}

test('live scores in the dark theme', async ({ page }) => {
  await open(page, 'live/scores', { theme: 'dark' });
  await expect(page).toHaveScreenshot('live-scores-dark.png', { fullPage: true });
});

test('a player profile', async ({ page }) => {
  await open(page, 'players');
  const firstRow = page.locator('.player-row, .players-list a, [data-player-row]').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await settle(page);
  }
  await expect(page).toHaveScreenshot('player-profile.png', { fullPage: true });
});

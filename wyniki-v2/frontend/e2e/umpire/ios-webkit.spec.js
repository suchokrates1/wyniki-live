import { expect, test } from '@playwright/test';
import { mockUmpireApi, openUmpire, openUmpireWithPwaGate, startBasicMatch } from './helpers.js';

test('iOS WebKit: the install hint dismisses and the language picker opens', async ({ page, browserName }) => {
  expect(browserName).toBe('webkit');
  await mockUmpireApi(page);
  await openUmpireWithPwaGate(page);
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toBeVisible();
  await expect(page.getByText(/Share, then Add to Home Screen/)).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Select Language');
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
});

test('iOS WebKit: Basic Next then WIN to 15', async ({ page, browserName }) => {
  expect(browserName).toBe('webkit');
  await startBasicMatch(page);
  await expect(page.getByRole('button', { name: 'ACE' })).toHaveCount(0);
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('15');
});

test('iOS WebKit: service worker registers on localhost', async ({ page, browserName }) => {
  expect(browserName).toBe('webkit');
  await mockUmpireApi(page);
  await openUmpire(page);
  await expect.poll(async () => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const ready = await navigator.serviceWorker.ready.catch(() => null);
    return ready?.active?.scriptURL || '';
  })).toMatch(/umpire-sw\.js$/);
});

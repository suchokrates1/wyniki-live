import { expect, test } from '@playwright/test';
import {
  emulateStandalonePwa,
  firePwaInstallPrompt,
  mockUmpireApi,
  openUmpire,
  openUmpireWithPwaGate,
  seedLanguage,
  stubPwaFullscreen,
} from './helpers.js';

test('PWA install: language screen offers native install', async ({ page }) => {
  await mockUmpireApi(page);
  await openUmpireWithPwaGate(page);
  await firePwaInstallPrompt(page);
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toBeVisible();
  await expect(page.getByText('Install the app on this tablet to hide the browser bar and umpire like on Android.')).toBeVisible();
  await page.getByRole('button', { name: 'Install app' }).click();
  expect(await page.evaluate(() => window.__umpireInstallPrompted)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('umpire.pwa_installed'))).toBe('1');
});

test('PWA install: accepted install then asks to turn the app on', async ({ page }) => {
  await mockUmpireApi(page);
  await openUmpireWithPwaGate(page);
  await firePwaInstallPrompt(page, 'accepted');
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible();
});

test('PWA install: Not now leaves the language picker', async ({ page }) => {
  await mockUmpireApi(page);
  await openUmpireWithPwaGate(page);
  await firePwaInstallPrompt(page);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { name: 'Select Tournament' })).toBeVisible();
});

test('PWA install: cancelled native prompt returns to language', async ({ page }) => {
  await mockUmpireApi(page);
  await openUmpireWithPwaGate(page);
  await firePwaInstallPrompt(page, 'dismissed');
  await page.getByRole('button', { name: 'Install app' }).click();
  expect(await page.evaluate(() => window.__umpireInstallPrompted)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
});

test('PWA install: gate does not appear after language is chosen', async ({ page }) => {
  await mockUmpireApi(page);
  await seedLanguage(page, 'en');
  await page.goto('/umpire.html');
  await page.locator('.ump-title').waitFor();
  await firePwaInstallPrompt(page);
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Select Tournament' })).toBeVisible();
});

test('PWA install: browser chrome still has fullscreen', async ({ page }) => {
  await openUmpire(page);
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
});

test('PWA on: already installed offers Open', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('umpire.pwa_installed', '1');
  });
  await openUmpireWithPwaGate(page);
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toBeVisible();
  await expect(page.getByText('The app is already installed. Open it for full-screen umpire mode.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible();
});

test('PWA on: Open requests fullscreen and continues to language', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('umpire.pwa_installed', '1');
  });
  await openUmpireWithPwaGate(page);
  await stubPwaFullscreen(page);
  await page.getByRole('button', { name: 'Open' }).click();
  expect(await page.evaluate(() => window.__umpireFullscreen)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Select Language' })).toBeVisible();
});

test('PWA on: related apps detection offers Open', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.getInstalledRelatedApps = async () => [
      { platform: 'webapp', url: '/umpire.webmanifest' },
    ];
  });
  await openUmpireWithPwaGate(page);
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toBeVisible();
});

test('PWA on: Not now leaves the language picker', async ({ page }) => {
  await mockUmpireApi(page);
  await page.addInitScript(() => {
    localStorage.setItem('umpire.pwa_installed', '1');
  });
  await openUmpireWithPwaGate(page);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { name: 'Select Tournament' })).toBeVisible();
});

test('PWA on: standalone skips the gate and hides fullscreen', async ({ page }) => {
  await emulateStandalonePwa(page);
  await openUmpireWithPwaGate(page);
  await firePwaInstallPrompt(page);
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
});

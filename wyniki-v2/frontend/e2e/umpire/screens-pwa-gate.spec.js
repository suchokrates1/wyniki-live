import { expect, test } from '@playwright/test';
import { openUmpireWithPwaGate } from './helpers.js';

test('language screen asks to install the PWA in one step', async ({ page }) => {
  await openUmpireWithPwaGate(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.preventDefault = () => {};
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await expect(page.getByRole('heading', { name: 'Install Blind Tennis Referee?' })).toBeVisible();
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('button', { name: /English/ })).toBeVisible();
});

test('language screen asks to open the PWA when it is already installed', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('umpire.pwa_installed', '1');
  });
  await openUmpireWithPwaGate(page);
  await expect(page.getByRole('heading', { name: 'Open Blind Tennis Referee?' })).toBeVisible();
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'Select Language' })).toBeVisible();
});

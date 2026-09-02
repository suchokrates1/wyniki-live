import { expect, test } from '@playwright/test';
import { enterPin, mockUmpireApi, openPinPad, startBasicMatch } from './helpers.js';

test('13 wrong PIN stays on the pad and clears digits', async ({ page }) => {
  await mockUmpireApi(page, { authorize: false });
  await openPinPad(page);
  await expect(page.getByRole('heading', { name: 'Court Authorization' })).toBeVisible();
  await enterPin(page, '0000');
  await expect(page.getByText(/Invalid PIN/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Court Authorization' })).toBeVisible();
  await expect(page.locator('.ump-pin__box', { hasText: '•' })).toHaveCount(0);
});

test('13 cancel PIN returns to the court list', async ({ page }) => {
  await mockUmpireApi(page);
  await openPinPad(page);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Select Court');
  await expect(page.getByRole('button', { name: 'Court 1' })).toBeVisible();
});

test('16 undo after WIN restores 0', async ({ page }) => {
  await startBasicMatch(page);
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('15');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undo last action?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('0');
});

test('21 finish dialog lists reasons and No keeps the match', async ({ page }) => {
  await startBasicMatch(page);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Why are you ending this match?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Normal finish' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test entry' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirement' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Walkover' })).toBeVisible();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
});

test('21 walkover picks a winner and hides Undo', async ({ page }) => {
  await startBasicMatch(page);
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Walkover' }).click();
  await expect(page.getByText('Who wins the walkover?')).toBeVisible();
  await page.getByRole('button', { name: /Kowalski/ }).click();
  await expect(page.getByRole('heading', { name: 'Match Finished!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

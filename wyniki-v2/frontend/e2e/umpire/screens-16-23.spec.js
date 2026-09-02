import { expect, test } from '@playwright/test';
import { confirmMatchSetup, mockUmpireApi, openUmpire, seedThroughCourt } from './helpers.js';

async function startBasicMatch(page) {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await confirmMatchSetup(page);
  await expect(page.getByRole('button', { name: /Kowalski/ })).toBeVisible();
  await expectServerSidesLeftRight(page);
  await page.getByRole('button', { name: /Kowalski/ }).first().click();
}

async function expectServerSidesLeftRight(page) {
  const left = page.locator('.ump-serve-btn').nth(0);
  const right = page.locator('.ump-serve-btn').nth(1);
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  expect(leftBox.x).toBeLessThan(rightBox.x);
  expect(Math.abs(leftBox.y - rightBox.y)).toBeLessThan(16);
}

test('16 server sides stay left and right on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await confirmMatchSetup(page);
  await expectServerSidesLeftRight(page);
});

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
  const pts = page.locator('.ump-board__pts').first();
  await pts.evaluate((el) => {
    window.__umpSawPulse = el.classList.contains('is-pulse');
    const obs = new MutationObserver(() => {
      if (el.classList.contains('is-pulse')) window.__umpSawPulse = true;
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    window.__umpPulseObs = obs;
  });
  await page.locator('.ump-win').first().click();
  await expect.poll(() => page.evaluate(() => window.__umpSawPulse)).toBe(true);
  await expect(pts).toHaveText('15');
});

test('18 Advanced ACE scores 15', async ({ page }) => {
  await seedThroughCourt(page);
  await mockUmpireApi(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await confirmMatchSetup(page, { advanced: true });
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
  await expect(page.getByText('Winner: Kowalski')).toBeVisible();
  await expect(page.getByText('Aces')).toHaveCount(0);
  await expect(page.getByText('Unforced Errors')).toHaveCount(0);
  await expect(page.getByText('Winners')).toBeVisible();
  await expect(page.getByText('4 / 0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '▶ Next Match (same setup)' })).toBeVisible();
});

async function dismissAnnouncement(page) {
  const shown = page.locator('.ump-announce.is-shown');
  if (await shown.isVisible()) {
    await shown.getByRole('button', { name: 'Continue' }).click();
    await expect(shown).toBeHidden();
  }
}

test('20–21 set break after first set', async ({ page }) => {
  await startBasicMatch(page);
  for (let game = 0; game < 4; game += 1) {
    for (let point = 0; point < 4; point += 1) {
      await dismissAnnouncement(page);
      const win = page.locator('.ump-basic__col').filter({ hasText: 'Kowalski' }).getByRole('button', { name: 'WIN' });
      await expect(win).toBeVisible();
      await win.click();
    }
  }
  const setBreak = page.locator('.ump-announce.is-shown');
  await expect(setBreak.getByRole('heading', { name: 'Set 1' })).toBeVisible();
  await expect(setBreak.getByText(/120 seconds/)).toBeVisible();
  await expect(setBreak.getByText(/Kowalski won the set 4–0/)).toBeVisible();
  await setBreak.getByRole('button', { name: 'Continue' }).click();
  await expect(setBreak).toBeHidden();
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
  await expect(page.getByText('No matches saved yet')).toBeVisible();
});

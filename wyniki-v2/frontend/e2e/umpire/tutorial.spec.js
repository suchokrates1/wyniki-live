import { expect, test } from '@playwright/test';
import { mockUmpireApi, openUmpire, seedLanguage } from './helpers.js';

async function tapNamedTutorialButton(page, name, tutorialId) {
  const loc = page.getByRole('button', { name, exact: typeof name === 'string' }).locator('visible=true').first();
  await expect(loc).toBeVisible();
  await expect.poll(async () => (await loc.boundingBox())?.width || 0, {
    message: `${name} must be on screen`,
  }).toBeGreaterThan(8);
  const box = await loc.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(({ px, py, expected }) => {
    const el = document.elementFromPoint(px, py);
    return el?.closest(`[data-tutorial="${expected}"]`) ? expected : (el?.className || el?.tagName || 'none');
  }, { px: x, py: y, expected: tutorialId });
  expect(hit, `${name} must be the real tap target`).toBe(tutorialId);
  await page.mouse.click(x, y);
}

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
  const guideAbovePinDim = await page.evaluate(() => {
    const bubble = document.querySelector('.ump-guide');
    const pin = document.querySelector('.ump-pin:not(.ump-guide-banner)');
    if (!bubble || !pin) return false;
    return Number(getComputedStyle(bubble).zIndex) > Number(getComputedStyle(pin).zIndex);
  });
  expect(guideAbovePinDim).toBe(true);
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
  await expect(page.locator('.ump-panel.ump-basic.is-shown')).toBeVisible();
  await tapNamedTutorialButton(page, 'WIN', 'winButton');
  await expect(guide.getByRole('heading', { name: 'Second serve' })).toBeVisible();
  await tapNamedTutorialButton(page, '2nd SERVE', 'secondServe');
  await expect(guide.getByRole('heading', { name: 'Double fault' })).toBeVisible();
  await tapNamedTutorialButton(page, 'DOUBLE FAULT', 'doubleFault');
  await expect(guide.getByRole('heading', { name: 'Undo' })).toBeVisible();
  await tapNamedTutorialButton(page, /Undo/, 'undo');
  await expect(guide.getByRole('heading', { name: 'New server' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Change of ends' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Set break' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Tiebreak' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Finish the match' })).toBeVisible();
  await tapNamedTutorialButton(page, 'Finish Match', 'finish');
  await expect(guide.getByRole('heading', { name: 'Retirement after injury' })).toBeVisible();
  await page.locator('[data-tutorial="retirement"]').click();
  await page.getByRole('button', { name: /Costa/ }).click();
  await expect(guide.getByRole('heading', { name: 'That’s the flow' })).toBeVisible();
  await expect(page.locator('[data-tutorial="done"]')).toBeVisible();
  await guide.getByRole('button', { name: 'Exit tutorial' }).click();
  await expect(page.getByTestId('tutorial-start')).toBeVisible();
  expect(matchPosts).toEqual([]);
});

test('Tutorial first-run banner can be dismissed', async ({ page }) => {
  await mockUmpireApi(page);
  await openUmpire(page, '', { keepTutorialBanner: true });
  await expect(page.getByTestId('tutorial-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.getByTestId('tutorial-banner')).toBeHidden();
});

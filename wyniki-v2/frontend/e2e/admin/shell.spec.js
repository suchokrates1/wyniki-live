/**
 * The admin shell: five setup sections, the address bar keeping them, the office linked out,
 * and the rail turning into a bottom bar on a phone.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openAdmin } from './helpers.js';

test('the rail holds the five setup sections and nothing the office owns', async ({ page }) => {
  await openAdmin(page);
  const items = page.locator('.adm-rail__item');
  await expect(items).toHaveText(['Turnieje', 'Zawodnicy', 'Korty i tablety', 'Overlay TV', 'System']);
  await expect(page.locator('.adm-rail__office a')).toHaveAttribute('href', '/office');
});

test('picking a section changes the heading and the address, and reload keeps it', async ({ page }) => {
  await openAdmin(page);
  await expect(page.locator('.adm-main__head h1')).toHaveText('Turnieje');

  await page.getByRole('button', { name: 'Korty i tablety' }).click();
  await expect(page.locator('.adm-main__head h1')).toHaveText('Korty i tablety');
  await expect(page).toHaveURL(/#\/korty\/courts$/);

  await page.getByRole('tab', { name: 'Tablety' }).click();
  await expect(page).toHaveURL(/#\/korty\/devices$/);

  await page.reload();
  await expect(page.locator('.adm-main__head h1')).toHaveText('Korty i tablety');
  await expect(page.getByRole('tab', { name: 'Tablety' })).toHaveAttribute('aria-selected', 'true');
});

test('the top bar names the tournament the site is pointed at', async ({ page }) => {
  await openAdmin(page);
  await expect(page.locator('.adm-top__chip')).toContainText('RAKIETY ATNiS VII');
});

test('on a phone the rail sits at the bottom and content clears it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone layout');
  await openAdmin(page);
  const rail = page.locator('.adm-rail');
  const box = await rail.boundingBox();
  const viewport = page.viewportSize();
  expect(await rail.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(viewport.height + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no sideways scrolling').toBeLessThanOrEqual(0);
  const padding = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.adm-main')).paddingBottom));
  expect(padding).toBeGreaterThanOrEqual(box.height);
});

// Scope: the rebuilt shell and the sections already redone. Views still on the old
// DaisyUI markup join this list as each phase rewrites them.
test('the rebuilt shell and the Turnieje section pass axe', async ({ page }) => {
  await openAdmin(page);
  const results = await new AxeBuilder({ page })
    .include('.adm-top')
    .include('.adm-rail')
    .include('.adm-card')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});

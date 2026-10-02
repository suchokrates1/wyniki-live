/** The phone layout: four tabs at the bottom, Overlay and System behind "Więcej", real targets. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openAdmin } from './helpers.js';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone layout');
  await openAdmin(page);
});

test('the bottom bar holds four tabs, the last one being the menu', async ({ page }) => {
  await expect(page.locator('.adm-rail__item')).toHaveText(['Turnieje', 'Zawodnicy', 'Korty', 'Więcej'],
    'four short labels, so none of them wraps');
});

test('the menu lists what left the bar, and each entry opens its section', async ({ page }) => {
  await page.locator('.adm-rail__item', { hasText: 'Więcej' }).click();
  await expect(page.locator('.adm-main__head h1')).toHaveText('Więcej');
  await expect(page).toHaveURL(/#\/wiecej$/);

  const entries = page.locator('.adm-more__item');
  await expect(entries).toHaveText([
    /Overlay TV/, /Panic/, /Poczta \(SMTP\)/, /Dostęp do panelu/,
  ]);
  await expect(page.locator('.adm-more__office')).toHaveAttribute('href', '/office');

  await entries.filter({ hasText: 'Poczta (SMTP)' }).click();
  await expect(page.locator('.adm-main__head h1')).toHaveText('System');
  await expect(page.locator('#adm-smtp-smtp-host')).toBeVisible();
});

test('a section reached through the menu keeps "Więcej" lit', async ({ page }) => {
  await page.locator('.adm-rail__item', { hasText: 'Więcej' }).click();
  await page.locator('.adm-more__item').filter({ hasText: 'Overlay TV' }).click();
  await expect(page.locator('.adm-main__head h1')).toHaveText('Overlay TV');
  const more = page.locator('.adm-rail__item', { hasText: 'Więcej' });
  await expect(more).toHaveClass(/is-active/);
  await expect(more).toHaveAttribute('aria-current', 'page');
});

test('a link straight to a section behind the menu still opens it', async ({ page }) => {
  await page.evaluate(() => { window.location.hash = '#/system'; });
  await expect(page.locator('.adm-main__head h1')).toHaveText('System');
  await expect(page.locator('.adm-rail__item', { hasText: 'Więcej' })).toHaveClass(/is-active/);
});

test('the top bar fits: brand on one line, the running tournament under it', async ({ page }) => {
  const brand = await page.locator('.adm-top__brand').boundingBox();
  const chip = await page.locator('.adm-top__chip').boundingBox();
  expect(chip.y).toBeGreaterThan(brand.y + brand.height - 2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no sideways scrolling').toBeLessThanOrEqual(0);
});

test('every tab and menu row is at least 44 px tall', async ({ page }) => {
  for (const item of await page.locator('.adm-rail__item').all()) {
    expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('.adm-rail__item', { hasText: 'Więcej' }).click();
  for (const item of await page.locator('.adm-more__item, .adm-more__office').all()) {
    expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
});

test('nothing in the menu sits under the bottom bar', async ({ page }) => {
  await page.locator('.adm-rail__item', { hasText: 'Więcej' }).click();
  const railTop = (await page.locator('.adm-rail').boundingBox()).y;
  const last = await page.locator('.adm-more__note').boundingBox();
  expect(last.y + last.height).toBeLessThanOrEqual(railTop);
});

test('the menu passes axe', async ({ page }) => {
  await page.locator('.adm-rail__item', { hasText: 'Więcej' }).click();
  const results = await new AxeBuilder({ page })
    .include('.adm-more')
    .include('.adm-rail')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

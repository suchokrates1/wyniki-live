import { expect } from '@playwright/test';

/** Which layout a project gets: the full tree from 1340 px, two rounds per phase from 700 px, one below. */
export function layoutOf(page) {
  const width = page.viewportSize().width;
  if (width >= 1340) return 'full';
  if (width >= 700) return 'tablet';
  return 'phone';
}

/** Collects page errors; a test ends with `expectNoErrors`. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export async function open(page, hash, { theme } = {}) {
  await page.addInitScript(() => { try { localStorage.setItem('lang', 'pl'); } catch { /* private mode */ } });
  await page.goto(`/?lang=pl#${encodeURIComponent(hash)}`);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForFunction(() => ![...document.querySelectorAll('.loading-state')].some((el) => el.offsetParent !== null), undefined, { timeout: 20_000 }).catch(() => {});
  const banner = page.locator('.consent-banner');
  if (await banner.isVisible().catch(() => false)) {
    await banner.locator('.consent-banner__btn--ghost').click();
    await expect(banner).toBeHidden();
  }
  if (theme) await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
}

/** The big draw: the public tournament with the most players. The small one: the other public one. */
export async function tournaments(page) {
  const list = await page.request.get('/api/tournament/list').then((response) => response.json());
  const sorted = [...list].sort((left, right) => (right.player_count || 0) - (left.player_count || 0));
  return { big: sorted[0], small: sorted[sorted.length - 1] };
}

export async function bracketOf(page, id) {
  return page.request.get(`/api/tournament/${id}/bracket`).then((response) => response.json());
}

export async function noSidewaysScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page does not scroll sideways').toBeLessThanOrEqual(1);
}

/** The visible panel of a category on the tournament page. */
export function categoryPanel(page, name) {
  return page.locator(`#tcat-panel-${name.replace(/\s+/g, '-')}`);
}

/** The main draw's block that this layout shows. */
export function mainTree(panel, layout) {
  const wrap = panel.locator('.btv-section > .btv-tree-wrap');
  if (layout === 'full') return wrap.locator('.btv-tree-scroll');
  return wrap.locator(layout === 'tablet' ? '.btv-phases--tablet' : '.btv-phases--phone');
}

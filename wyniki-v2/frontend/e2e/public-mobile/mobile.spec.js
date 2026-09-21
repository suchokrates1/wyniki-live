/**
 * The public site on phones: layout (slim header, bottom tab bar, one row of switches,
 * rows instead of cards), everything reachable and readable, and nothing the full site
 * does lost on the way — the live scoreboard in particular stays exactly as it is.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const LIVE = !!process.env.PUBLIC_MOBILE_BASE_URL;

async function open(page, hash, lang = 'pl') {
  await page.addInitScript((code) => { try { localStorage.setItem('lang', code); } catch { /* private mode */ } }, lang);
  await page.goto(`/?lang=${lang}#${hash}`);
  await expect(page.locator('.tab-bar')).toBeVisible();
  await page.waitForFunction(() => ![...document.querySelectorAll('.loading-state')].some((el) => el.offsetParent !== null), undefined, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/** Scrolls the page; a short page gets a spacer first, so sticky and fixed parts can be checked. */
async function scrollDown(page, by, spacerIn = 'main') {
  await page.evaluate(({ distance, selector }) => {
    if (document.documentElement.scrollHeight - window.innerHeight < distance) {
      // the spacer goes inside the section under test: a sticky element only sticks within its own parent
      const host = [...document.querySelectorAll(selector)].find((el) => el.offsetParent !== null) || document.querySelector('main');
      const spacer = document.createElement('div');
      spacer.style.height = `${distance + window.innerHeight}px`;
      spacer.dataset.testSpacer = '1';
      host.appendChild(spacer);
    }
    window.scrollBy(0, distance);
  }, { distance: by, selector: spacerIn });
  await page.waitForTimeout(300);
}

async function firstTournamentId(page) {
  const list = await page.evaluate(async () => (await fetch('/api/tournament/list')).json());
  return (Array.isArray(list) ? list : list?.tournaments || [])[0]?.id;
}

async function firstProfileId(page) {
  const players = await page.evaluate(async () => (await fetch('/api/players/all')).json());
  const first = (Array.isArray(players) ? players : [])[0];
  return first ? `players/${first.global_player_id ? 'global/' + first.global_player_id : first.id}` : null;
}

const ROUTES = [
  ['live scores', 'live/scores'],
  ['live bracket', 'live/bracket'],
  ['live schedule', 'live/schedule'],
  ['live history', 'live/history'],
  ['tournaments', 'tournaments'],
  ['players', 'players'],
];

for (const [name, hash] of ROUTES) {
  test(`${name}: fits the phone, slim header, tab bar at the bottom, no horizontal scroll`, async ({ page }) => {
    await open(page, hash);
    const layout = await page.evaluate(() => {
      const header = document.querySelector('.header').getBoundingClientRect();
      const bar = document.querySelector('.tab-bar').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        header: header.height,
        barBottom: Math.round(window.innerHeight - bar.bottom),
        barHeight: bar.height,
        barPosition: getComputedStyle(document.querySelector('.tab-bar')).position,
        bodyPad: parseFloat(getComputedStyle(document.body).paddingBottom),
        footer: getComputedStyle(document.querySelector('.vm-footer')).position,
      };
    });
    expect(layout.overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0);
    expect(layout.header).toBeLessThanOrEqual(64);
    expect(layout.barPosition).toBe('fixed');
    expect(Math.abs(layout.barBottom)).toBeLessThanOrEqual(1);
    expect(layout.barHeight).toBeGreaterThanOrEqual(56);
    expect(layout.bodyPad, 'the last content is not hidden under the bar').toBeGreaterThanOrEqual(layout.barHeight - 2);
    expect(layout.footer, 'the footer no longer covers the lists').toBe('static');
  });

  test(`${name}: every visible control is a real touch target (WCAG 2.5.8, 24 px; our aim 44 px)`, async ({ page }) => {
    await open(page, hash);
    const small = await page.evaluate(() => {
      const inText = (el) => el.tagName === 'A' && el.closest('p, li, td, .schedule-card__notes');
      return [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [role=tab]')]
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
        .filter((el) => !el.closest('.sr-only') && !inText(el))
        .map((el) => { const r = el.getBoundingClientRect(); return { el: (el.className || el.tagName).toString().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter((box) => box.w > 0 && box.h > 0 && (box.w < 24 || box.h < 24));
    });
    expect(small, 'controls under 24×24 px').toEqual([]);
  });

  test(`${name}: WCAG 2.2 AA (axe, colour contrast included)`, async ({ page }) => {
    await open(page, hash);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.vm-footer__logo')
      .analyze();
    const found = results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 4).join(' | ')}`);
    expect(found).toEqual([]);
  });
}

test('the bottom tab bar switches the main sections and stays put while scrolling', async ({ page }) => {
  await open(page, 'live/scores');
  const bar = page.locator('.tab-bar');
  await expect(bar.getByRole('tab')).toHaveCount(3);
  for (const [id, hashPart] of [['tab-main-players', 'players'], ['tab-main-tournaments', 'tournaments'], ['tab-main-live', 'live']]) {
    await page.locator(`#${id}`).click();
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`#${hashPart}`));
    await expect(page.locator(`#${id} .tab-btn__icon`)).toBeVisible();
  }
  await page.locator('#tab-main-players').click();
  const before = await bar.boundingBox();
  await scrollDown(page, 2000);
  const after = await bar.boundingBox();
  expect(Math.round(after.y)).toBe(Math.round(before.y));
});

test('the tournament switches are one row that scrolls sideways and sticks under the header', async ({ page }) => {
  await open(page, 'live/schedule');
  const row = page.locator('.live-subnav');
  const box = await row.boundingBox();
  const tabs = row.getByRole('tab');
  const count = await tabs.count();
  const tops = new Set();
  for (let index = 0; index < count; index += 1) tops.add(Math.round((await tabs.nth(index).boundingBox()).y));
  expect(tops.size, 'all switches in one row').toBe(1);
  await tabs.last().scrollIntoViewIfNeeded();
  await tabs.last().click();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await tabs.first().scrollIntoViewIfNeeded();
  await tabs.first().click();
  // scroll past the row but stay inside the live section: a sticky row only sticks within it
  const before = (await row.boundingBox()).y;
  await scrollDown(page, Math.round(before) + 120, '#panel-live-schedule');
  const header = await page.locator('.header').boundingBox();
  const stuck = await row.boundingBox();
  expect(stuck.y, 'the switches stay under the header').toBeGreaterThanOrEqual(header.y + header.height - 2);
  expect(stuck.y).toBeLessThanOrEqual(header.y + header.height + 2);
  expect(box.height).toBeLessThanOrEqual(72);
});

test('the language control shows a short code and still changes the language', async ({ page }) => {
  await open(page, 'live/scores');
  await expect(page.locator('.lang-select__code')).toHaveText('PL');
  await page.locator('#langSelect').selectOption('en');
  await expect(page.locator('.lang-select__code')).toHaveText('EN');
  await expect(page.locator('#tab-main-players')).toContainText(/Players/i);
  await expect(page.locator('#langSelect')).toHaveAccessibleName(/.+/);
});

test('live scores: every court keeps the full-site scoreboard, in the same order', async ({ page, browser }) => {
  await open(page, 'live/scores');
  const phone = await page.evaluate(() => [...document.querySelectorAll('.grid > .court-tv')].map((court) => ({
    id: court.id,
    visible: court.offsetHeight > 0,
    board: court.querySelector('[aria-hidden="true"]')?.innerHTML.replace(/\s+/g, ' ').replace(/sb-tv-anim[\w-]*/g, '').length > 0,
    classes: [...court.querySelectorAll('[class*="sb-tv"]')].map((el) => el.className.split(' ')[0]).join(','),
  })));
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const wide = await desktop.newPage();
  await open(wide, 'live/scores');
  const full = await wide.evaluate(() => [...document.querySelectorAll('.grid > .court-tv')].map((court) => ({
    id: court.id,
    classes: [...court.querySelectorAll('[class*="sb-tv"]')].map((el) => el.className.split(' ')[0]).join(','),
  })));
  await desktop.close();
  expect(phone.map((court) => court.id)).toEqual(full.map((court) => court.id));
  expect(phone.every((court) => court.visible && court.board)).toBe(true);
  expect(phone.map((court) => court.classes), 'the same scoreboard parts as on the full site').toEqual(full.map((court) => court.classes));
  const widths = await page.$$eval('.grid > .court-tv', (courts) => courts.map((court) => court.getBoundingClientRect().width));
  for (const width of widths) expect(width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('schedule: search and court switch work; a match is a compact row', async ({ page }) => {
  await open(page, 'live/schedule');
  const cards = page.locator('.schedule-card:visible');
  test.skip((await cards.count()) === 0, 'no schedule published');
  const first = cards.first();
  const box = await first.boundingBox();
  expect(box.height, 'a match row, not a tall card').toBeLessThanOrEqual(150);
  const columns = await first.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(3);
  const name = (await first.locator('.schedule-card__player').first().textContent()).trim().split(/\s+/).slice(-1)[0];
  await page.locator('.schedule-search__input').fill(name);
  await page.waitForTimeout(300);
  const names = await page.locator('.schedule-card:visible .schedule-card__match').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((text) => text.includes(name))).toBe(true);
  await page.locator('.schedule-search__input').fill('');
  const courtTabs = page.locator('.schedule-switcher__tab:visible');
  if ((await courtTabs.count()) > 1) {
    await courtTabs.nth(1).click();
    await expect(courtTabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  }
  await page.locator('.schedule-sort__button').nth(1).click();
  await expect(page.locator('.schedule-sort__button').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('bracket: categories are one sideways row; picking the last one shows its table', async ({ page }) => {
  await open(page, 'live/bracket');
  const tabs = page.locator('.cat-tabs').first().getByRole('tab');
  const count = await tabs.count();
  test.skip(count < 2, 'one category only');
  const tops = new Set();
  for (let index = 0; index < count; index += 1) tops.add(Math.round((await tabs.nth(index).boundingBox()).y));
  expect(tops.size, 'categories in one row').toBe(1);
  const last = tabs.last();
  await last.scrollIntoViewIfNeeded();
  const label = (await last.textContent()).trim();
  await last.click();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main')).toContainText(label);
});

test('players: one row per player, filters in two rows, a row opens the profile', async ({ page }) => {
  await open(page, 'players');
  const rows = page.locator('.player-card');
  await expect(rows.first()).toBeVisible();
  const first = await rows.first().boundingBox();
  expect(first.height).toBeLessThanOrEqual(96);
  const filtersBottom = await page.locator('#panel-main-players .player-filters--row2').evaluate((el) => el.getBoundingClientRect().bottom);
  expect(filtersBottom, 'filters leave room for the list').toBeLessThanOrEqual(330);
  const name = (await rows.first().locator('.player-card__name').textContent()).trim();
  await page.locator('#player-search-input').fill(name.split(' ').slice(-1)[0]);
  await expect(rows.first().locator('.player-card__name')).toContainText(name.split(' ').slice(-1)[0]);
  await page.locator('.player-filter-btns .filter-btn').nth(2).click();
  await page.locator('#player-search-input').fill('');
  await page.locator('.player-filter-btns .filter-btn').nth(0).click();
  await rows.first().click();
  await expect(page.locator('.pp-header')).toBeVisible();
  const header = await page.locator('.pp-header').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(header, 'avatar beside the name').toBe(2);
  const stats = page.locator('.pp-stat');
  const statTops = new Set();
  for (let index = 0; index < await stats.count(); index += 1) statTops.add(Math.round((await stats.nth(index).boundingBox()).y));
  expect(statTops.size, 'statistics in one row').toBe(1);
  await page.getByRole('button', { name: /Powrót|Back/ }).first().click();
  await expect(rows.first()).toBeVisible();
});

test('player profile and a tournament page pass axe and fit the phone', async ({ page }) => {
  await open(page, 'players');
  const profile = await firstProfileId(page);
  const tournament = await firstTournamentId(page);
  for (const hash of [profile, tournament && `tournaments/${tournament}/bracket`].filter(Boolean)) {
    await open(page, hash);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('.vm-footer__logo').analyze();
    expect(results.violations.map((violation) => `${hash} ${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  }
});

test('the full site on a desktop keeps its layout: tabs on top, no phone-only parts', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await open(page, 'live/scores');
  const desktop = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('.tab-bar')).position,
    barTop: document.querySelector('.tab-bar').getBoundingClientRect().top,
    icons: [...document.querySelectorAll('.tab-btn__icon')].filter((el) => el.getBoundingClientRect().width > 0).length,
    code: document.querySelector('.lang-select__code').getBoundingClientRect().width,
    updated: document.querySelector('.header-updated').getBoundingClientRect().width,
    footer: getComputedStyle(document.querySelector('.vm-footer')).position,
  }));
  await context.close();
  expect(desktop.bar).not.toBe('fixed');
  expect(desktop.barTop).toBeLessThan(300);
  expect(desktop.icons).toBe(0);
  expect(desktop.code).toBe(0);
  expect(desktop.updated).toBe(0);
  expect(desktop.footer).toBe('fixed');
});

test.describe('live stack only', () => {
  test.skip(!LIVE, 'runs against PUBLIC_MOBILE_BASE_URL');
  test('the live SSE/polling keeps the header time current', async ({ page }) => {
    await open(page, 'live/scores');
    await expect(page.locator('.header-updated')).toBeVisible();
    await expect(page.locator('.header-updated')).toHaveText(/\d{1,2}:\d{2}/);
  });
});

/**
 * The redesigned bracket on a big draw (Wilno 2026: 7 groups, 1/8 with two byes, consolation,
 * places 5-8 and 9-16) and a small one: group cards, the drawn tree or its phases, the pin,
 * links to profiles, the champion's line, the address that carries category and pin.
 */
import { expect, test } from '@playwright/test';
import { bracketOf, categoryPanel, layoutOf, mainTree, noSidewaysScroll, open, tournaments, watchErrors } from './helpers.js';

const CAT = 'B1 Men';
let big;
let small;

test.beforeEach(async ({ page }) => {
  ({ big, small } = await tournaments(page));
});

test('groups: one card each, tables of a row equally tall, matches folded until asked', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, `tournaments/${big.id}/bracket/${CAT}`);
  const panel = categoryPanel(page, CAT);
  await expect(panel.locator('.btv-group')).toHaveCount(7);
  await expect(panel.locator('.bt-format')).toContainText('Najpierw grupy, potem puchar');

  const tables = await panel.locator('.btv-group__table').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height) };
  }));
  const rows = new Map();
  tables.forEach((table) => rows.set(table.top, [...(rows.get(table.top) || []), table.height]));
  rows.forEach((heights) => expect(Math.max(...heights) - Math.min(...heights), 'tables of one row share a height').toBeLessThanOrEqual(1));

  const folds = panel.locator('.btv-group__matches');
  expect(await folds.evaluateAll((els) => els.filter((el) => el.open).length), 'matches folded at first').toBe(0);
  const groupE = panel.locator('.btv-group').filter({ hasText: 'Grupa E' });
  await groupE.locator('.btv-group__matches > summary').click();
  await expect(groupE.locator('.btv-match-list .btv-match')).toHaveCount(3);
  await expect(groupE.locator('tr').filter({ hasText: 'Jani Kallunki' }).locator('.btv-pos.is-q')).toHaveCount(1);
  await expect(groupE.locator('tr').filter({ hasText: 'Jani Kallunki' })).toContainText('mistrz');
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('podium and the champion line come from the main final', async ({ page }) => {
  await open(page, `tournaments/${big.id}/bracket/${CAT}`);
  const panel = categoryPanel(page, CAT);
  await expect(panel.locator('.btv-podium__item')).toHaveText([/Jani Kallunki/, /Naqi Rizvi/, /Harufumi Shiozawa/]);
  const champ = mainTree(panel, layoutOf(page)).locator('.btv-champ').first();
  if (layoutOf(page) !== 'full') {
    await mainTree(panel, layoutOf(page)).getByRole('tab').last().click();
  }
  await expect(champ).toContainText('Mistrz świata B1');
  await expect(champ).toContainText('Jani Kallunki');
});

test('the main draw: every round, both byes, the 3rd-place match, drawn to fit the layout', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, `tournaments/${big.id}/bracket/${CAT}`);
  const panel = categoryPanel(page, CAT);
  const layout = layoutOf(page);
  const tree = mainTree(panel, layout);
  await expect(tree).toBeVisible();
  for (const other of ['full', 'tablet', 'phone'].filter((name) => name !== layout)) {
    await expect(mainTree(panel, other), `${other} layout hidden`).toBeHidden();
  }
  if (layout === 'full') {
    await expect(tree.locator('.btv-slot')).toHaveCount(16);
    await expect(tree.locator('.btv-slot').filter({ hasText: 'wolny los' })).toHaveCount(2);
    await expect(tree.locator('.btv-round-label')).toHaveText(['1/8 finału', 'Ćwierćfinał', 'Półfinał', 'Finał', 'Mecz o 3. miejsce']);
    expect(await tree.evaluate((el) => el.scrollWidth - el.clientWidth), 'the whole tree fits at 1440 px').toBeLessThanOrEqual(1);
    expect(await tree.locator('.btv-conn').count(), 'connectors drawn').toBeGreaterThan(20);
  } else {
    const tabs = tree.getByRole('tab');
    const names = layout === 'tablet' ? ['1/8 finału', 'Ćwierćfinał', 'Półfinał · Finał'] : ['1/8 finału', 'Ćwierćfinał', 'Półfinał', 'Finał'];
    await expect(tabs).toHaveText(names);
    // a finished draw opens on its final phase
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    const first = tree.getByRole('tabpanel').first();
    await expect(first).toHaveAttribute('aria-hidden', 'false');
    await expect(first.locator('.btv-slot').filter({ hasText: 'wolny los' })).toHaveCount(2);
    await expect(tree.locator('.btv-phases__hint')).toBeVisible();
  }
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('a swipe moves one phase; a vertical drag is left to the page', async ({ page }) => {
  test.skip(layoutOf(page) === 'full', 'the full tree has no phases');
  await open(page, `tournaments/${big.id}/bracket/${CAT}`);
  const tree = mainTree(categoryPanel(page, CAT), layoutOf(page));
  const tabs = tree.getByRole('tab');
  const count = await tabs.count();
  const viewport = tree.locator('.btv-phases__viewport');
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  const y = box.y + Math.min(120, box.height / 2);
  const drag = async (fromX, toX, toY = y) => {
    await page.mouse.move(fromX, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) await page.mouse.move(fromX + ((toX - fromX) * step) / 8, y + ((toY - y) * step) / 8);
    await page.mouse.up();
    await page.waitForTimeout(450);
  };
  await expect(tabs.nth(count - 1)).toHaveAttribute('aria-selected', 'true');
  await drag(box.x + 40, box.x + box.width - 40);
  await expect(tabs.nth(count - 2)).toHaveAttribute('aria-selected', 'true');
  await drag(box.x + box.width - 40, box.x + 40);
  await expect(tabs.nth(count - 1)).toHaveAttribute('aria-selected', 'true');
  await drag(box.x + box.width / 2, box.x + box.width / 2 + 20, y + 150);
  await expect(tabs.nth(count - 1), 'a vertical drag keeps the phase').toHaveAttribute('aria-selected', 'true');
});

test('a pin lights the way, goes into the address, and comes off', async ({ page }) => {
  await open(page, `tournaments/${big.id}/bracket/${CAT}`);
  const panel = categoryPanel(page, CAT);
  const pin = panel.locator('.btv-table .btv-pin[aria-label*="Jani Kallunki"]');
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.btv-pinbar')).toContainText('Jani Kallunki');
  await expect.poll(() => decodeURIComponent(page.url())).toContain('?pin=Jani Kallunki');
  const layout = layoutOf(page);
  if (layout === 'full') {
    await expect(mainTree(panel, layout).locator('.btv-match.is-pinned')).toHaveCount(4);
  } else {
    // every phase shows its part of the way; the final phase holds the final
    await expect(mainTree(panel, layout).getByRole('tabpanel').last().locator('.btv-match.is-pinned').first()).toBeVisible();
  }
  await panel.locator('.btv-pinbar button').click();
  await expect(panel.locator('.btv-match.is-pinned')).toHaveCount(0);
  await expect.poll(() => decodeURIComponent(page.url())).not.toContain('pin=');
});

test('a link with a pin opens the category and the side draw the player went on in', async ({ page }) => {
  await open(page, `tournaments/${big.id}/bracket/${CAT}?pin=Rafał Sudoł`);
  const panel = categoryPanel(page, CAT);
  await expect(panel).toBeVisible();
  await expect(page.locator('.cat-tab--active')).toHaveText(CAT);
  const folds = panel.locator('.btv-fold');
  await expect(folds.locator('summary strong')).toHaveText(['Turniej pocieszenia', 'Pocieszenie: o miejsca 5–8', 'O miejsca 5–8', 'O miejsca 9–16', 'Pozostałe mecze']);
  await expect.poll(() => folds.first().evaluate((el) => el.open), 'the consolation draw opens by itself').toBe(true);
  await expect(folds.first()).toContainText('Zwycięzca: Luca Parravano');
  const pinned = await folds.first().locator('.btv-match.is-pinned').count();
  expect(pinned, 'his consolation matches lit').toBeGreaterThanOrEqual(3);
  await expect(panel.locator('tr').filter({ hasText: 'Rafał Sudoł' })).toContainText('pocieszenie');
});

test('a name opens the global profile', async ({ page }) => {
  await open(page, `tournaments/${big.id}/bracket/${CAT}`);
  const link = categoryPanel(page, CAT).locator('.btv-table a', { hasText: 'Naqi Rizvi' });
  await expect(link).toHaveAttribute('href', /#players\/global\/\d+/);
  await link.click();
  await expect(page.locator('.pfv-name')).toHaveText('Naqi Rizvi');
});

test('every category of both tournaments draws without an error', async ({ page }) => {
  const errors = watchErrors(page);
  for (const tournament of [big, small]) {
    const bracket = await bracketOf(page, tournament.id);
    await open(page, `tournaments/${tournament.id}/bracket`);
    const tabs = page.locator('#panel-main-tournaments .cat-tab');
    const count = await tabs.count();
    expect(count, `${tournament.name} has categories`).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const tab = tabs.nth(index);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      const name = (await tab.textContent()).trim();
      const panel = page.locator('[id^="tcat-panel-"]:visible');
      await expect(panel, name).toHaveCount(1);
      await expect(panel.locator('.btv'), name).toBeVisible();
    }
    expect(Object.keys(bracket.players || {}).length, 'the payload names its players').toBeGreaterThan(0);
  }
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('the live bracket of the active tournament uses the same panel', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'live/bracket');
  await expect(page.locator('#panel-live-bracket .btv').first()).toBeVisible();
  const tab = page.locator('#panel-live-bracket .cat-tab').last();
  await tab.click();
  const name = (await tab.textContent()).trim();
  await expect.poll(() => decodeURIComponent(page.url())).toContain(`live/bracket/${name}`);
  expect(errors).toEqual([]);
});

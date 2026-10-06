/**
 * The redesigned player profile: header, tiles, tournaments with the way through them and
 * bracket match cards, opponents linked to their profiles, head to head.
 */
import { expect, test } from '@playwright/test';
import { bracketOf, layoutOf, noSidewaysScroll, open, tournaments, watchErrors } from './helpers.js';

async function profileOf(page, name) {
  const { big } = await tournaments(page);
  const bracket = await bracketOf(page, big.id);
  const entry = bracket.players[name];
  return entry.global_player_id ? `players/global/${entry.global_player_id}` : `players/${entry.player_id}`;
}

test('a profile: header, tiles, the newest tournament open with its way and matches', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, await profileOf(page, 'Rafał Sudoł'));
  const view = page.locator('.pfv');
  await expect(view.locator('.pfv-name')).toHaveText('Rafał Sudoł');
  await expect(view.locator('.pfv-chips')).toContainText('PL');
  await expect(view.locator('.pfv-chips')).toContainText('B1');
  await expect(view.locator('.pfv-tile')).toHaveCount(5);

  // the newest tournament opens by itself; the others wait for a tap
  await expect.poll(() => view.locator('.pfv-tournament').first().evaluate((el) => el.open)).toBe(true);
  const { big } = await tournaments(page);
  const wilno = view.locator('.pfv-tournament').filter({ hasText: big.name });
  if (!(await wilno.evaluate((el) => el.open))) await wilno.locator('summary').click();
  // a consolation final is no medal
  await expect(wilno.locator('.pfv-result')).not.toHaveText(/Srebro|Złoto|Brąz/);
  await expect(wilno.locator('.pfv-step')).toContainText(['Grupa A · 3. miejsce', 'Pocieszenie · Ćwierćfinał', 'Pocieszenie · Półfinał', 'Pocieszenie · Finał']);
  await expect(wilno.locator('.pfv-match')).toHaveCount(5);

  const naqi = wilno.locator('.pfv-match').filter({ hasText: 'Naqi Rizvi' });
  // her row first and plain, the opponent's a link with the country
  await expect(naqi.locator('.btv-row').first().locator('a')).toHaveCount(0);
  await expect(naqi.locator('.btv-row').nth(1).locator('a')).toHaveAttribute('href', /#players\/global\/\d+/);
  await expect(naqi.locator('.btv-row').nth(1).locator('.btv-tag')).toHaveText('GB');
  await expect(naqi.locator('.pfv-match__meta')).toContainText('Porażka');

  await expect(view.locator('.pfv-rivals li').first()).toContainText('Mecze:');
  // where to ask about the data: a prepared e-mail naming the player, and the privacy policy
  const data = view.locator('.pfv-data');
  await expect(data).toContainText('contact@blindtennis.app');
  const mail = await data.getByRole('link', { name: 'Napisz w sprawie danych' }).getAttribute('href');
  expect(decodeURIComponent(mail)).toContain('mailto:contact@blindtennis.app?subject=Dane zawodnika: Rafał Sudoł');
  await expect(data.getByRole('link', { name: 'Polityka prywatności' })).toHaveAttribute('href', /\/privacy\?lang=pl#rights/);
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('an opponent link leads to the opponent, and back leads to where you came from', async ({ page }) => {
  await open(page, await profileOf(page, 'Rafał Sudoł'));
  await page.locator('.pfv-tournament').evaluateAll((els) => els.forEach((el) => { el.open = true; }));
  await page.locator('.pfv-match .btv-row a', { hasText: 'Luca Parravano' }).first().click();
  await expect(page.locator('.pfv-name')).toHaveText('Luca Parravano');
  // "back" is the browser's back: from the opponent to the profile the link was on
  await page.getByRole('button', { name: /Powrót/ }).first().click();
  await expect(page.locator('.pfv-name')).toHaveText('Rafał Sudoł');
});

test('on a phone the avatar stays beside the name and the numbers keep one row', async ({ page }) => {
  test.skip(layoutOf(page) !== 'phone', 'phone layout only');
  await open(page, await profileOf(page, 'Jani Kallunki'));
  const avatar = await page.locator('.pfv-avatar').boundingBox();
  const name = await page.locator('.pfv-name').boundingBox();
  expect(name.x).toBeGreaterThan(avatar.x + avatar.width - 1);
  const tops = await page.locator('.pfv-tile').evaluateAll((els) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))]);
  expect(tops.length, 'tiles in one row').toBe(1);
});

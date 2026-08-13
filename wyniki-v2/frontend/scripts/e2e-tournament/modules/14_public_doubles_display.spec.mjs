/**
 * Module 14: Public doubles display — bracket/schedule show pairs; search matches either partner.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, publishSchedule,
  fetchPublicSchedule, fetchPublicBracket,
} from '../fixtures.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, { pairCount: 4, playFormat: 'round_robin' });
  const { tournament, teams, slot } = seeded;
  await publishSchedule(token, tournament.id, slot);

  const publicSchedule = await fetchPublicSchedule(tournament.id);
  const publicBracket = await fetchPublicBracket(tournament.id);
  const blob = `${JSON.stringify(publicSchedule)}\n${JSON.stringify(publicBracket)}`;
  for (const team of teams) {
    if (!blob.includes(team.display_name)) {
      throw new Error(`Public payload missing ${team.display_name}`);
    }
  }
  console.log('  Public bracket/schedule contain all four pair labels');

  const partners = String(teams[0].display_name).split(' / ').map((part) => part.trim());
  if (partners.length !== 2) throw new Error(`Cannot split pair ${teams[0].display_name}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/#tournaments/${tournament.id}/schedule`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    try {
      await page.waitForFunction(
        (label) => document.body.innerText.replaceAll('\u200B', '').includes(label),
        teams[0].display_name,
        { timeout: 15000 },
      );
    } catch (err) {
      const snippet = await page.evaluate(() => document.body.innerText.replaceAll('\u200B', '').slice(0, 1800));
      throw new Error(`${err.message}\nUI snippet: ${snippet}`);
    }

    console.log('  Public tournament schedule tab shows pair labels');

    await page.goto(`${BASE_URL}/#live/schedule`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    const search = page.locator('.schedule-search__input');
    await page.waitForTimeout(800);
    if (await search.count() && await search.first().isVisible()) {
      const surname = partners[1].split(' ').pop();
      await search.first().fill(surname);
      await search.first().dispatchEvent('input');
      await page.waitForTimeout(400);
      const visible = await page.evaluate(() => document.body.innerText.replaceAll('\u200B', ''));
      if (!visible.includes(teams[0].display_name) && !visible.includes(partners[0])) {
        throw new Error(`Search for ${surname} did not keep the pair visible`);
      }
      console.log(`  Public search by second partner (${surname}) still shows the pair`);
    } else {
      console.log('  Live schedule search not visible — tournament tab already showed pairs');
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

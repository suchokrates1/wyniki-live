/**
 * Module 11: Doubles category + pairs — confirm Double, 4 pairs, RR, public schedule shows "A / B".
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, publishSchedule,
  fetchPublicSchedule, fetchAdminSchedule, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, { pairCount: 4, playFormat: 'round_robin' });
  const { tournament, teams, slot } = seeded;
  await publishSchedule(token, tournament.id, slot);
  console.log(`  Doubles tournament id=${tournament.id} teams=${teams.length} slot=${slot}`);

  const pairLabels = teams.map((team) => team.display_name).filter(Boolean);
  if (pairLabels.length !== 4 || pairLabels.some((label) => !label.includes(' / '))) {
    throw new Error(`Expected 4 canonical pair labels, got ${JSON.stringify(pairLabels)}`);
  }

  const adminSchedule = await fetchAdminSchedule(token, tournament.id);
  const rrRows = (adminSchedule || []).filter((entry) => String(entry.phase || '').includes('Grupowa'));
  if (!rrRows.length) throw new Error('RR schedule has no Grupowa rows');
  const sample = rrRows[0];
  if (!String(sample.player1_name || '').includes(' / ') || !String(sample.player2_name || '').includes(' / ')) {
    throw new Error(`RR row is not pair vs pair: ${sample.player1_name} vs ${sample.player2_name}`);
  }
  console.log('  Admin schedule uses pair labels');

  const publicSchedule = await fetchPublicSchedule(tournament.id);
  const publicText = JSON.stringify(publicSchedule);
  for (const label of pairLabels.slice(0, 2)) {
    if (!publicText.includes(label)) {
      throw new Error(`Public schedule missing pair label ${label}`);
    }
  }
  console.log('  Public schedule shows A / B labels');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();
    await planningPage.expandStep1();
    try {
      await page.waitForFunction(
        (label) => {
          const text = document.body.innerText.replaceAll('\u200B', '');
          return text.toLowerCase().includes('debel') && text.includes(label);
        },
        pairLabels[0],
        { timeout: 12000 },
      );
    } catch (err) {
      const snippet = await page.evaluate(() => document.body.innerText.replaceAll('\u200B', '').slice(0, 1800));
      throw new Error(`${err.message}\nUI snippet: ${snippet}`);
    }
    console.log('  Office: Debel badge and pair names visible');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

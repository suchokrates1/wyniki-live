/**
 * Module 17: Office progress tab — doc 23 (pairs vs players).
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, { pairCount: 4, playFormat: 'round_robin' });
  const { teams, slot } = seeded;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const planningPage = new OfficePlanningPage(page);
    await planningPage.openProgressTab();
    await page.waitForFunction(
      () => {
        const text = document.body.innerText.replaceAll('\u200B', '');
        return text.includes('Plan') && text.includes('Gotowe') && text.includes('Zostało');
      },
      undefined,
      { timeout: 12000 },
    );
    const body = await page.evaluate(() => document.body.innerText.replaceAll('\u200B', ''));
    if (!body.toLowerCase().includes('pary') && !body.includes('Pary')) {
      throw new Error('Progress tab should label doubles composition as Pary');
    }
    const pair = teams[0].display_name;
    if (!body.includes(pair)) {
      throw new Error(`Progress chips missing pair ${pair}`);
    }
    console.log('  Progress: Plan/Gotowe/Zostało + pair chips');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

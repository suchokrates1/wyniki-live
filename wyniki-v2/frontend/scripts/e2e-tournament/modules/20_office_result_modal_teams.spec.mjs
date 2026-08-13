/**
 * Module 20: Result modal on doubles — doc 27 (Para A / Para B).
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeResultsPage } from '../pages/officeResults.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, { pairCount: 2, playFormat: 'round_robin' });
  const { teams, slot } = seeded;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const resultsPage = new OfficeResultsPage(page);
    await resultsPage.openAddResult();

    const modalText = await page.locator('.office-modal').filter({ hasText: 'Zapisz wynik' }).innerText();
    const normalized = modalText.replaceAll('\u200B', '');
    if (!normalized.includes('Para A') || !normalized.includes('Para B')) {
      throw new Error(`Doubles result modal should use Para A/B, got: ${normalized.slice(0, 400)}`);
    }
    if (!normalized.includes('Walkower') || !normalized.includes('Set 1')) {
      throw new Error('Result modal missing walkover or set fields');
    }
    console.log('  Modal: Para A/B, walkover, sets');

    await resultsPage.ensureGroupPlayersSelected();
    await resultsPage.enterScore([4, 4], [1, 2]);
    await resultsPage.submitResult();

    await resultsPage.navigateToHistory();
    const history = (await resultsPage.getHistoryPlayerSnippet()).replaceAll('\u200B', '');
    if (!history.includes(teams[0].display_name) && !history.includes(' / ')) {
      throw new Error('History after UI save does not show pair labels');
    }
    console.log('  Saved doubles group result from UI; history shows pairs');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

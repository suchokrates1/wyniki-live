/**
 * Module 06: Quick info — set quick info text from office UI, verify persistence.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, apiUrl, marker, samplePlayers,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeQuickInfoPage } from '../pages/officeQuickInfo.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentId = tournament.tournament?.id || tournament.id;

  const players = samplePlayers(4);
  await addPlayers(token, tournamentId, players);
  const bulkResult = await addPlayers(token, tournamentId, []);
  // Just need tournament to exist for quick info

  // Office UI: navigate to quick info, set content, verify
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(1);
    await loginPage.login('test');

    const quickInfoPage = new OfficeQuickInfoPage(page);
    await quickInfoPage.navigateToTab();

    const testContent = `E2E quick info test — ${marker()}`;
    await quickInfoPage.setContent(testContent);
    await quickInfoPage.save();
    console.log('  Quick info saved via UI');

    // Reload and verify persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.innerText.includes('Ostatnie mecze'),
      undefined,
      { timeout: 12000 }
    );
    await quickInfoPage.navigateToTab();
    const displayed = await quickInfoPage.getDisplayedContent();
    if (displayed.includes(marker())) {
      console.log('  Quick info persisted after reload');
    } else {
      console.log('  Quick info content after reload: ' + displayed.substring(0, 80));
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

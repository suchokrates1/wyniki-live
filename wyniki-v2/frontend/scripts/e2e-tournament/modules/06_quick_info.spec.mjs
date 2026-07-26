/**
 * Module 06: Quick info — publish banner text from office hero, verify persistence.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, cleanup, resolveOfficeSlot,
  OFFICE_PASSWORD, marker,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeQuickInfoPage } from '../pages/officeQuickInfo.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentName = tournament.name;
  const slot = await resolveOfficeSlot(tournamentName);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    const quickInfoPage = new OfficeQuickInfoPage(page);
    const testContent = `E2E quick info test — ${marker()}`;
    await quickInfoPage.setContent(testContent);
    await quickInfoPage.save();
    console.log('  Quick info saved via UI');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.innerText.includes('Ostatnie mecze')
        || document.body.innerText.includes('Wejście do biura zawodów'),
      undefined,
      { timeout: 15000 }
    );
    const needsLogin = await page.evaluate(
      () => document.body.innerText.includes('Wejście do biura zawodów')
    );
    if (needsLogin) {
      await loginPage.login(OFFICE_PASSWORD);
    }

    const displayed = await quickInfoPage.getDisplayedContent();
    if (!displayed.includes(marker())) {
      throw new Error(`Quick info did not persist; got: ${displayed.slice(0, 120)}`);
    }
    console.log('  Quick info persisted after reload');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

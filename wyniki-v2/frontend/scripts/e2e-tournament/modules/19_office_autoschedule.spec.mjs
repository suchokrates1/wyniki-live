/**
 * Module 19: Schedule + autoschedule controls — doc 26.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups, generateSchedule,
  cleanup, samplePlayers, resolveOfficeSlot, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const players = samplePlayers(4);
  const bulk = await addPlayers(token, tournament.id, players);
  await saveGroups(token, tournament.id, [{ name: 'B1 — Grupa A', players: bulk.player_ids }]);
  await generateSchedule(token, tournament.id);
  const slot = await resolveOfficeSlot(tournament.name);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const schedulePage = new OfficeSchedulePage(page);
    await schedulePage.navigateToTab();
    await schedulePage.waitForEntries();

    const body = await page.evaluate(() => document.body.innerText);
    for (const label of ['Generuj mecze', 'Generuj rewanże', 'Opublikuj wszystkie', 'Zakres', 'Generuj propozycję']) {
      if (!body.includes(label)) {
        throw new Error(`Schedule step 2 missing control: ${label}`);
      }
    }
    console.log('  Step 2 generate/publish/autoschedule controls visible');

    await page.getByRole('button', { name: 'Generuj propozycję' }).click();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => document.body.innerText);
    if (after.includes('Zatwierdź terminarz') || after.includes('Odrzuć propozycję') || after.includes('Generuj propozycję')) {
      console.log('  Generate proposal clicked (preview or board still present)');
    }

    await page.getByRole('button', { name: 'Opublikuj wszystkie' }).click();
    await page.waitForTimeout(800);
    console.log('  Publish-all clicked');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

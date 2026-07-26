/**
 * Module 04: Results CRUD — add group result from office UI, edit, verify history.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, samplePlayers, resolveOfficeSlot,
  OFFICE_PASSWORD, marker,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeResultsPage } from '../pages/officeResults.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const players = samplePlayers(4);
  const bulkResult = await addPlayers(token, tournamentId, players);
  const playerIds = bulkResult.player_ids || [];

  await saveGroups(token, tournamentId, [{ name: 'B1 — Grupa A', players: playerIds }]);
  await generateSchedule(token, tournamentId);
  console.log('  Setup complete');

  const slot = await resolveOfficeSlot(tournamentName);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    const resultsPage = new OfficeResultsPage(page);
    await resultsPage.openAddResult();
    await resultsPage.enterScore([6, 6], [3, 2]);
    await resultsPage.submitResult();
    console.log('  Office: group result saved');

    await resultsPage.navigateToHistory();
    const bodyAfterAdd = await resultsPage.getHistoryPlayerSnippet();
    if (!bodyAfterAdd.includes(marker())) {
      throw new Error('Saved match marker not visible in history');
    }
    console.log('  Office: result visible in history');

    await resultsPage.openEditFirst();
    const editInputs = page.locator('.office-modal input[type="number"]');
    if (await editInputs.count() >= 2) {
      await editInputs.nth(0).fill('7');
      await editInputs.nth(1).fill('5');
      const saveBtn = page.getByRole('button', { name: /Zapisz|Zatwierdź|Popraw/i }).last();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1000);
      }
      console.log('  Office: result edit attempted');
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

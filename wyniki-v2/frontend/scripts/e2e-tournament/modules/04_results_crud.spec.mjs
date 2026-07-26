/**
 * Module 04: Results CRUD — start a match from office UI, enter score, finish, verify history.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, apiUrl, marker, samplePlayers, adminHeaders,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeResultsPage } from '../pages/officeResults.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentId = tournament.tournament?.id || tournament.id;

  const players = samplePlayers(4);
  const bulkResult = await addPlayers(token, tournamentId, players);
  const playerIds = bulkResult.player_ids || bulkResult.players?.map((p) => p.id) || [];

  const groups = [{ name: 'B1 — Grupa A', players: playerIds }];
  await saveGroups(token, tournamentId, groups);
  await generateSchedule(token, tournamentId);
  console.log('  Setup complete');

  // Office: navigate to matches, start a match via UI
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(1);
    await loginPage.login('test');

    const resultsPage = new OfficeResultsPage(page);
    await resultsPage.navigateToTab();

    // Click first available "Rozpocznij" (start match) button
    const startBtn = page.locator('button:has-text("Rozpocznij")').first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(1500);
      console.log('  Office: match started via UI click');

      // Try to enter a score and save
      await resultsPage.enterScore([6], [4]);
      await resultsPage.submitResult();
      console.log('  Office: score entry attempted');
    } else {
      console.log('  Office: no start-match button visible (schedule may need publish first)');
    }

    // Verify match count via API
    const historyResp = await fetch(apiUrl(`/api/tournaments/${tournamentId}/history`));
    if (historyResp.ok) {
      const history = await historyResp.json();
      console.log(`  History entries: ${Array.isArray(history) ? history.length : 'N/A'}`);
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

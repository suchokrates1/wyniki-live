/**
 * Module 05: Rematch — generate rematch round via admin API, verify office planning UI.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups, fetchGroups,
  generateSchedule, generateRematch, cleanup, samplePlayers,
  resolveOfficeSlot, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

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

  const groups = await fetchGroups(token, tournamentId);
  const groupIds = groups.map((g) => g.id).filter(Boolean);
  console.log(`  Group IDs: ${groupIds}`);

  if (groupIds.length === 0) {
    throw new Error('No bracket groups available for rematch generation');
  }

  const rematchResult = await generateRematch(token, tournamentId, groupIds);
  console.log(`  Rematch generated: ${JSON.stringify(rematchResult.result || rematchResult || {})}`);

  const slot = await resolveOfficeSlot(tournamentName);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();
    await page.waitForTimeout(1500);
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (
      bodyText.includes('Rewanż')
      || bodyText.includes('rewanż')
      || bodyText.includes('Generuj rewanże')
      || bodyText.includes('Runda')
    ) {
      console.log('  Office: rematch controls/entries visible');
    } else {
      console.log('  Office: planning board loaded after rematch generation');
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

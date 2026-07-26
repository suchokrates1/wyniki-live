/**
 * Module 03: Schedule publish — generate schedule via API, publish, verify in office schedule tab.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, publishSchedule, officeLogin, cleanup,
  apiUrl, marker, samplePlayers, adminHeaders,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentId = tournament.tournament?.id || tournament.id;

  const players = samplePlayers(8);
  const bulkResult = await addPlayers(token, tournamentId, players);
  const playerIds = bulkResult.player_ids || bulkResult.players?.map((p) => p.id) || [];

  const groups = [
    { name: 'B1 — Grupa A', players: playerIds.slice(0, 4) },
    { name: 'B1 — Grupa B', players: playerIds.slice(4, 8) },
  ];
  await saveGroups(token, tournamentId, groups);
  await generateSchedule(token, tournamentId);
  await publishSchedule(token, tournamentId);
  console.log('  Schedule generated and published');

  // Verify in office
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(1);
    await loginPage.login('test');

    const schedulePage = new OfficeSchedulePage(page);
    await schedulePage.navigateToTab();
    await schedulePage.waitForEntries();
    console.log('  Office: schedule entries visible');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

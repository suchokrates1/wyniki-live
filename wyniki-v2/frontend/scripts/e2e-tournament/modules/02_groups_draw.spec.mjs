/**
 * Module 02: Groups draw — seed players via API, save bracket groups, verify in office UI.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, samplePlayers, resolveOfficeSlot, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const players = samplePlayers(8);
  const bulkResult = await addPlayers(token, tournamentId, players);
  const playerIds = bulkResult.player_ids || [];
  console.log(`  Created ${playerIds.length} players`);

  const groups = [
    { name: 'B1 — Grupa A', players: playerIds.slice(0, 4) },
    { name: 'B1 — Grupa B', players: playerIds.slice(4, 8) },
  ];
  await saveGroups(token, tournamentId, groups);
  console.log('  Groups saved');

  await generateSchedule(token, tournamentId);
  console.log('  Schedule generated');

  const slot = await resolveOfficeSlot(tournamentName);
  console.log(`  Office slot=${slot}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();
    await planningPage.waitForGroups();
    console.log('  Office: groups visible in Plan turnieju');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

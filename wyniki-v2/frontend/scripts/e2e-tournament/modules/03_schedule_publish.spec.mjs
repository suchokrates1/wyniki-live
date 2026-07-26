/**
 * Module 03: Schedule publish — generate + publish, verify planning board in office.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, publishSchedule, cleanup, samplePlayers,
  resolveOfficeSlot, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const players = samplePlayers(8);
  const bulkResult = await addPlayers(token, tournamentId, players);
  const playerIds = bulkResult.player_ids || [];

  const groups = [
    { name: 'B1 — Grupa A', players: playerIds.slice(0, 4) },
    { name: 'B1 — Grupa B', players: playerIds.slice(4, 8) },
  ];
  await saveGroups(token, tournamentId, groups);
  await generateSchedule(token, tournamentId);

  const slot = await resolveOfficeSlot(tournamentName);
  await publishSchedule(token, tournamentId, slot);
  console.log('  Schedule generated and published');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    const schedulePage = new OfficeSchedulePage(page);
    await schedulePage.navigateToTab();
    await schedulePage.waitForEntries();
    console.log('  Office: schedule board visible');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

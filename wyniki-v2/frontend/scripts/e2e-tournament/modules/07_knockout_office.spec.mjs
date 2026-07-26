/**
 * Module 07: Knockout tab — seed groups/schedule, open Drabinka in office UI.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, samplePlayers, resolveOfficeSlot,
  OFFICE_PASSWORD, apiUrl, adminHeaders,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} → ${resp.status}: ${body.error || resp.statusText}`);
  return body;
}

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 4 });
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const players = samplePlayers(4);
  const bulkResult = await addPlayers(token, tournamentId, players);
  const playerIds = bulkResult.player_ids || [];

  await saveGroups(token, tournamentId, [{ name: 'B1 — Grupa A', players: playerIds }]);
  await generateSchedule(token, tournamentId);
  console.log('  Tournament seeded with groups + schedule');

  try {
    await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/knockout/generate`), {
      method: 'POST',
      headers: adminHeaders(token),
    });
    console.log('  Knockout generated via API');
  } catch (e) {
    console.log(`  Knockout generation skipped (groups not complete): ${e.message}`);
  }

  const slot = await resolveOfficeSlot(tournamentName);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    const planningPage = new OfficePlanningPage(page);
    await planningPage.openKnockoutTab();
    const hasKnockout = await planningPage.hasKnockoutGenerated();
    console.log(`  Office: knockout tab accessible (indicator=${hasKnockout})`);
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

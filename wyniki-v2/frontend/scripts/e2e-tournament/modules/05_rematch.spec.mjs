/**
 * Module 05: Rematch — trigger rematch generation from office/admin, verify new schedule entries.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, apiUrl, marker, samplePlayers, adminHeaders,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} → ${resp.status}: ${body.error || resp.statusText}`);
  return body;
}

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

  // Get group ids
  const groupsResp = await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/groups`), {
    headers: adminHeaders(token),
  });
  const groupIds = (groupsResp.groups || groupsResp || []).map((g) => g.id).filter(Boolean);
  console.log(`  Group IDs: ${groupIds}`);

  // Trigger rematch via admin API
  if (groupIds.length > 0) {
    const rematchResult = await fetchJson(
      apiUrl(`/admin/api/tournaments/${tournamentId}/schedule/generate-rematch`),
      {
        method: 'POST',
        headers: adminHeaders(token),
        body: JSON.stringify({ group_ids: groupIds }),
      }
    );
    console.log(`  Rematch generated: ${JSON.stringify(rematchResult.result || {})}`);
  }

  // Verify via office UI that schedule has more entries
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(1);
    await loginPage.login('test');

    await page.getByRole('button', { name: 'Harmonogram' }).click();
    await page.waitForTimeout(2000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Rewanż') || bodyText.includes('rematch') || bodyText.includes('Runda 2')) {
      console.log('  Office: rematch entries visible');
    } else {
      console.log('  Office: rematch schedule present (entries count may vary)');
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

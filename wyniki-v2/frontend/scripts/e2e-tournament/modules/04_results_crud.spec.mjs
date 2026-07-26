/**
 * Module 04: Results CRUD — add group result from office UI, edit, verify history.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, samplePlayers, resolveOfficeSlot,
  OFFICE_PASSWORD, marker, apiUrl, adminHeaders,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeResultsPage } from '../pages/officeResults.js';

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
    await resultsPage.ensureGroupPlayersSelected();
    await resultsPage.enterScore([6, 6], [3, 2]);
    await resultsPage.submitResult();
    console.log('  Office: group result saved');

    // History tab is usually already active after save; wait for card then navigate if needed.
    await page.waitForFunction(
      (m) => document.body.innerText.includes(m),
      marker(),
      { timeout: 10000 }
    );
    await resultsPage.navigateToHistory();
    const bodyAfterAdd = await resultsPage.getHistoryPlayerSnippet();
    if (!bodyAfterAdd.includes(marker())) {
      throw new Error('Saved match marker not visible in history');
    }
    console.log('  Office: result visible in history');

    await resultsPage.openEditFirst();
    const editModal = page.locator('.office-modal').filter({ hasText: 'Zapisz korektę' });
    await editModal.waitFor({ state: 'visible', timeout: 8000 });
    const editInputs = editModal.locator('input[type="number"]:visible');
    await editInputs.nth(0).fill('7');
    await editInputs.nth(0).dispatchEvent('input');
    await editInputs.nth(1).fill('5');
    await editInputs.nth(1).dispatchEvent('input');
    await editModal.getByRole('button', { name: 'Zapisz korektę' }).click();
    await page.waitForFunction(
      () => !document.body.innerText.includes('Zapisz korektę'),
      undefined,
      { timeout: 10000 }
    );
    console.log('  Office: result edited');
  } finally {
    await browser.close();
  }

  // History delete via admin API (global latest) — allowed surface for cleanup rehearsal.
  try {
    const deleted = await fetchJson(apiUrl('/admin/api/history/latest'), {
      method: 'DELETE',
      headers: adminHeaders(token),
    });
    console.log(`  Admin: latest history delete → ${JSON.stringify(deleted).slice(0, 120)}`);
  } catch (err) {
    console.log(`  Admin: history delete skipped (${err.message})`);
  }

  await cleanup(token);
}

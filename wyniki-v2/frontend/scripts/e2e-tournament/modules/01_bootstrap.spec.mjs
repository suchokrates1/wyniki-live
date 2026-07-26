/**
 * Module 01: Bootstrap — create tournament via admin API, verify health & admin panel access.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, cleanup,
  adminHeaders, apiUrl, marker, samplePlayers,
} from '../fixtures.js';
import { AdminBootstrapPage } from '../pages/adminBootstrap.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  // 1. Verify health
  const healthResp = await fetch(apiUrl('/health'));
  if (!healthResp.ok) throw new Error(`Health check failed: ${healthResp.status}`);
  console.log('  Health: OK');

  // 2. Admin login via API
  const token = await adminLogin();
  console.log('  Admin login: OK');

  // 3. Create simulation tournament
  const tournament = await createTournament(token);
  const tournamentId = tournament.tournament?.id || tournament.id;
  if (!tournamentId) throw new Error('Tournament creation failed — no ID returned');
  console.log(`  Tournament created: id=${tournamentId}, name includes marker=${marker()}`);

  // 4. Add sample players
  const players = samplePlayers(8);
  await addPlayers(token, tournamentId, players);
  console.log(`  Added ${players.length} players`);

  // 5. Verify admin panel via browser
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const adminPage = new AdminBootstrapPage(page, BASE_URL);
    await adminPage.goto();
    await adminPage.login();
    const loggedIn = await adminPage.isLoggedIn();
    if (!loggedIn) throw new Error('Admin panel login via browser failed');
    console.log('  Admin panel browser login: OK');
  } finally {
    await browser.close();
  }

  // 6. Cleanup
  const cleanupResult = await cleanup(token);
  console.log(`  Cleanup: ${JSON.stringify(cleanupResult)}`);
}

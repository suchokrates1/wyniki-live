/**
 * Module 13: Office doubles result — group + knockout on pair labels; walkover; correction; standings.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, fetchPublicBracket,
  fetchAdminSchedule, officeLogin, officeGroupMatch, officeUpdateMatch,
  OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeResultsPage } from '../pages/officeResults.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, { pairCount: 2, playFormat: 'round_robin' });
  const { tournament, teams, slot } = seeded;
  const office = await officeLogin(slot);
  const schedule = await fetchAdminSchedule(token, tournament.id);
  const rr = schedule.find((entry) => String(entry.phase || '').includes('Grupowa'));
  if (!rr) throw new Error('No Grupowa slot to score');

  const created = await officeGroupMatch(slot, office.token, {
    group_id: rr.bracket_group_id,
    schedule_id: rr.id,
    player1_name: teams[0].display_name,
    player2_name: teams[1].display_name,
    walkover: true,
    winner_name: teams[0].display_name,
  });
  const matchId = created.match?.match_id || created.match?.id || created.id;
  if (!matchId) throw new Error(`Walkover response missing match id: ${JSON.stringify(created).slice(0, 240)}`);
  console.log('  Walkover saved on pair labels');

  await officeUpdateMatch(slot, office.token, matchId, {
    source: 'match',
    sets: [
      { player1_games: 1, player2_games: 4 },
      { player1_games: 2, player2_games: 4 },
    ],
  });
  console.log('  Correction saved');

  const bracket = await fetchPublicBracket(tournament.id);
  const standings = bracket?.groups?.[0]?.standings || [];
  if (!standings.length) throw new Error('Standings empty after doubles result');
  if (standings.some((row) => !String(row.name || '').includes(' / '))) {
    throw new Error(`Standings are not pair labels: ${JSON.stringify(standings.map((row) => row.name))}`);
  }
  const winner = standings[0]?.name;
  if (winner !== teams[1].display_name) {
    throw new Error(`Expected corrected winner ${teams[1].display_name}, got ${winner}`);
  }
  console.log('  Standings use pair labels; corrected winner is on top');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const resultsPage = new OfficeResultsPage(page);
    await resultsPage.navigateToHistory();
    const body = (await resultsPage.getHistoryPlayerSnippet()).replaceAll('\u200B', '');
    if (!body.includes(teams[0].display_name) || !body.includes(teams[1].display_name)) {
      throw new Error('History does not show both pair labels');
    }
    console.log('  Office history shows pair names');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

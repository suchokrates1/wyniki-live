/**
 * Module 12: Group play format — dropdown on the card; RR-only has no KO; knockout-only has no RR; two groups+KO cross.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, generateKnockout,
  fetchAdminSchedule, fetchPublicBracket, fetchGroups, officeLogin, officeGroupMatch,
  OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

function phaseOf(entry) {
  return String(entry?.phase || '');
}

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, {
    pairCount: 8,
    groupSpecs: [
      { name: 'B1 Double — Grupa A', play_format: 'groups_knockout', teamIndexes: [0, 1] },
      { name: 'B1 Double — Grupa B', play_format: 'groups_knockout', teamIndexes: [2, 3] },
      { name: 'B1 Double — Grupa C', play_format: 'round_robin', teamIndexes: [4, 5] },
      { name: 'B1 Double — Grupa D', play_format: 'knockout', teamIndexes: [6, 7] },
    ],
  });
  const { tournament, teams, slot } = seeded;
  const groups = await fetchGroups(token, tournament.id);
  const byName = (letter) => groups.find((group) => String(group.name || '').includes(`Grupa ${letter}`));

  const schedule = await fetchAdminSchedule(token, tournament.id);
  const dNames = new Set([teams[6].display_name, teams[7].display_name]);
  const dRows = schedule.filter((entry) => dNames.has(entry.player1_name) || dNames.has(entry.player2_name));
  if (dRows.some((entry) => phaseOf(entry).includes('Grupowa'))) {
    throw new Error('knockout-only Grupa D should not get Grupowa RR rows');
  }
  const cNames = new Set([teams[4].display_name, teams[5].display_name]);
  const cRows = schedule.filter((entry) => cNames.has(entry.player1_name) || cNames.has(entry.player2_name));
  if (!cRows.some((entry) => phaseOf(entry).includes('Grupowa'))) {
    throw new Error('round_robin Grupa C should have Grupowa rows');
  }
  console.log(`  Formats: C RR rows=${cRows.length}, D knockout rows=${dRows.length} (no Grupowa)`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();
    await planningPage.expandStep1();
    const formats = await page.waitForFunction(
      () => {
        const match = [...document.querySelectorAll('select')].find((select) => {
          const values = [...select.options].map((option) => option.value);
          return values.includes('groups_knockout') && values.includes('round_robin') && values.includes('knockout');
        });
        return match ? [...match.options].map((option) => option.value) : null;
      },
      undefined,
      { timeout: 12000 },
    );
    if (!formats) throw new Error('Play-format dropdown with three modes not found');
    console.log('  Office: play-format dropdown has groups_knockout / round_robin / knockout');
  } finally {
    await browser.close();
  }

  const office = await officeLogin(slot);
  await officeGroupMatch(slot, office.token, {
    group_id: byName('A').id,
    player1_name: teams[0].display_name,
    player2_name: teams[1].display_name,
    sets: [
      { player1_games: 4, player2_games: 1 },
      { player1_games: 4, player2_games: 2 },
    ],
  });
  await officeGroupMatch(slot, office.token, {
    group_id: byName('B').id,
    player1_name: teams[2].display_name,
    player2_name: teams[3].display_name,
    sets: [
      { player1_games: 4, player2_games: 0 },
      { player1_games: 4, player2_games: 1 },
    ],
  });
  try {
    await generateKnockout(token, tournament.id);
  } catch (err) {
    console.log(`  Knockout generate: ${err.message}`);
  }
  const bracket = await fetchPublicBracket(tournament.id);
  const blob = JSON.stringify(bracket);
  if (!blob.includes('Półfinał') && !blob.includes('Finał')) {
    throw new Error('Expected knockout tree after two completed groups_knockout groups');
  }
  console.log('  Two groups_knockout groups produced a knockout tree');

  await cleanup(token);
}

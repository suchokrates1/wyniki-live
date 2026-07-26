/**
 * Module 09: large seed — 3 categories × groups × 4 courts (API + office smoke).
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, resolveOfficeSlot,
  OFFICE_PASSWORD, marker, samplePlayers,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

function categoryPlayers(category, count, offset) {
  const base = samplePlayers(offset + count);
  return base.slice(offset, offset + count).map((p, i) => ({
    ...p,
    category,
    name: p.name.replace(/-P\d+/, `-P${offset + i + 1}`),
    last_name: `${marker()}-${category}-P${i + 1}`,
  }));
}

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 4 });
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const bands = ['B1', 'B2', 'B3'];
  const allPlayers = [];
  for (let b = 0; b < bands.length; b += 1) {
    allPlayers.push(...categoryPlayers(bands[b], 8, b * 8));
  }
  // samplePlayers only has 12 names — synthesize extras
  while (allPlayers.length < 24) {
    const i = allPlayers.length;
    const band = bands[Math.floor(i / 8)];
    allPlayers.push({
      name: `Player ${marker()}-${band}-P${(i % 8) + 1}`,
      category: band,
      country: 'PL',
      first_name: `P${i}`,
      last_name: `${marker()}-${band}-X${(i % 8) + 1}`,
      gender: i % 2 === 0 ? 'K' : 'M',
    });
  }

  const bulk = await addPlayers(token, tournamentId, allPlayers.slice(0, 24));
  const ids = bulk.player_ids || [];
  const groups = [];
  for (let b = 0; b < 3; b += 1) {
    const slice = ids.slice(b * 8, b * 8 + 8);
    groups.push(
      { name: `${bands[b]} — Grupa A`, players: slice.slice(0, 4) },
      { name: `${bands[b]} — Grupa B`, players: slice.slice(4, 8) },
    );
  }
  await saveGroups(token, tournamentId, groups);
  await generateSchedule(token, tournamentId);
  console.log('  Seeded 3 categories × 2 groups × 4 courts');

  const slot = await resolveOfficeSlot(tournamentName);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const schedulePage = new OfficeSchedulePage(page);
    await schedulePage.navigateToTab();
    await schedulePage.waitForEntries();
    const body = await page.evaluate(() => document.body.innerText);
    for (const band of bands) {
      if (!body.includes(band)) {
        throw new Error(`Expected category ${band} visible in office after large seed`);
      }
    }
    console.log('  Office: large seed categories visible on schedule/planning');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}

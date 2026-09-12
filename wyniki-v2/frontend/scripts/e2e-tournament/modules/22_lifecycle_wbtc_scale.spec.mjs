/**
 * Module 22: tournament lifecycle at World Championships scale (structure of Vilnius 2026).
 *
 * 8 categories, 29 groups, 107 players, 11 courts, 5 days. Through the office:
 * B1 courts and the day window, "Rozstaw fazę grupową" across days (no double-booked
 * player), publishing, then the whole group stage day by day with every result type
 * (sets, set tie-break, super tie-break, retirement, walkover) — a sample of each per day
 * typed into the result dialog, the rest through the same office endpoints. Standings of
 * every group are recomputed independently and compared. Categories whose groups the
 * system turns into a knockout (one group here) get their bracket planned with
 * "Rozstaw fazę pucharową" and played in "Drabinka"; the public bracket must agree.
 *
 * Set E2E_KEEP=1 to keep the tournament.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, confirmCategories, saveGroups, cleanup,
  resolveOfficeSlot, officeLogin, OFFICE_PASSWORD, fetchPublicSchedule, fetchPublicBracket, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const KEEP = process.env.E2E_KEEP === '1';
const STRUCTURE = JSON.parse(readFileSync(new URL('../data/wbtc2026-structure.json', import.meta.url), 'utf-8'));
const log = (message) => console.log(`  ${message}`);
const isoDay = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const ddmm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const toMinutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
};

async function waitUntil(label, probe, { timeout = 30000, interval = 400 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// Deterministic results: kind by index, winner by a hash of the schedule id.
const KINDS = ['walkover', 'retirement', 'supertb', 'tiebreak', 'straight', 'straight', 'straight', 'straight', 'straight', 'straight'];
function plannedResult(entry, index) {
  const kind = KINDS[index % KINDS.length];
  const winnerIsA = ((Number(entry.id) * 2654435761) >>> 0) % 2 === 0;
  const orient = (winner, loser) => (winnerIsA ? [winner, loser] : [loser, winner]);
  if (kind === 'walkover') return { kind, winnerIsA };
  if (kind === 'retirement') {
    // the retiring player had won the first set; play stops at 1:1 in the second
    const [a1, b1] = orient(2, 4);
    return { kind, winnerIsA, sets: [[a1, b1], [1, 1]] };
  }
  if (kind === 'supertb') {
    const [a1, b1] = orient(4, 2);
    const [a2, b2] = orient(1, 4);
    const [a3, b3] = orient(10, 7);
    return { kind, winnerIsA, sets: [[a1, b1], [a2, b2]], stb: [a3, b3] };
  }
  if (kind === 'tiebreak') {
    const [a1, b1] = orient(4, 3);
    const [a2, b2] = orient(4, 1);
    return { kind, winnerIsA, sets: [[a1, b1, 5], [a2, b2]] };
  }
  const loserGames = Number(entry.id) % 3;
  const [a1, b1] = orient(4, loserGames);
  const [a2, b2] = orient(4, (loserGames + 1) % 3);
  return { kind, winnerIsA, sets: [[a1, b1], [a2, b2]] };
}

function resultPayload(entry, result) {
  const base = {
    group_id: entry.bracket_group_id,
    schedule_id: entry.id,
    player1_name: entry.player1_name,
    player2_name: entry.player2_name,
    phase: 'Grupowa',
  };
  const winner = result.winnerIsA ? entry.player1_name : entry.player2_name;
  const loser = result.winnerIsA ? entry.player2_name : entry.player1_name;
  if (result.kind === 'walkover') return { ...base, walkover: true, winner_name: winner, sets: [] };
  const sets = result.sets.map(([p1, p2, tb]) => ({
    player1_games: p1, player2_games: p2, ...(tb != null ? { tiebreak_loser_points: tb } : {}),
  }));
  if (result.stb) sets.push({ player1_games: result.stb[0], player2_games: result.stb[1], is_super_tiebreak: true });
  if (result.kind === 'retirement') return { ...base, retirement: true, retired_player_name: loser, sets };
  return { ...base, sets };
}

// Mirror of the server's standings rules, computed from what the test entered.
function expectedStandings(names, results) {
  const stats = Object.fromEntries(names.map((name) => [name, {
    wins: 0, losses: 0, sets_won: 0, sets_lost: 0, games_won: 0, games_lost: 0, played: 0,
  }]));
  for (const { entry, result } of results) {
    const a = entry.player1_name;
    const b = entry.player2_name;
    if (!stats[a] || !stats[b]) continue;
    const winner = result.winnerIsA ? a : b;
    const loser = winner === a ? b : a;
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    if (result.kind === 'walkover') {
      [setsA, setsB] = result.winnerIsA ? [2, 0] : [0, 2];
      [gamesA, gamesB] = result.winnerIsA ? [8, 0] : [0, 8];
    } else {
      result.sets.forEach(([p1, p2], index) => {
        gamesA += p1;
        gamesB += p2;
        const interrupted = result.kind === 'retirement' && index === result.sets.length - 1 && !result.stb;
        if (!interrupted) {
          if (p1 > p2) setsA += 1;
          else setsB += 1;
        }
      });
      if (result.stb) {
        if (result.stb[0] > result.stb[1]) setsA += 1;
        else setsB += 1;
      }
    }
    stats[a].played += 1;
    stats[b].played += 1;
    stats[winner].wins += 1;
    stats[loser].losses += 1;
    stats[a].sets_won += setsA;
    stats[a].sets_lost += setsB;
    stats[b].sets_won += setsB;
    stats[b].sets_lost += setsA;
    stats[a].games_won += gamesA;
    stats[a].games_lost += gamesB;
    stats[b].games_won += gamesB;
    stats[b].games_lost += gamesA;
  }
  return stats;
}

export default async function run() {
  const adminToken = await adminLogin();
  const days = Array.from({ length: STRUCTURE.days }, (_, index) => isoDay(index));
  const tournament = await createTournament(adminToken, {
    startDate: days[0], endDate: days[days.length - 1], courts: STRUCTURE.courts, isSimulation: false, isPublic: true,
  });
  const tournamentId = tournament.id;
  const tag = tournament.name.split(' ')[0];
  log(`Tournament ${tournamentId}: ${STRUCTURE.courts} courts, ${days[0]}…${days[days.length - 1]}`);

  // ——— seed: categories, players, groups ———
  const confirmed = await confirmCategories(adminToken, tournamentId, STRUCTURE.categories.map((category) => ({
    preset_key: category.preset_key, label: category.label, hint_bands: category.hint_bands, is_doubles: false,
  })));
  const categoryId = Object.fromEntries((confirmed.categories || []).map((category) => [category.label, category.id]));
  const byCategory = {};
  for (const group of STRUCTURE.groups) (byCategory[group.category] ||= []).push(group);
  const playersByGroup = {};
  const seedPlayers = [];
  for (const group of STRUCTURE.groups) {
    const letter = group.name.split('Grupa ').pop() || 'X';
    const [band, sex] = group.category.split(' ');
    playersByGroup[group.name] = [];
    for (let i = 1; i <= group.size; i += 1) {
      const name = `${band}${sex[0]}-${letter}${i} ${tag}`;
      playersByGroup[group.name].push(name);
      seedPlayers.push({ name, first_name: `${band}${sex[0]}-${letter}${i}`, last_name: tag, category: band, gender: sex === 'Men' ? 'M' : 'K', country: 'PL' });
    }
  }
  const created = await addPlayers(adminToken, tournamentId, seedPlayers);
  const playerId = Object.fromEntries(seedPlayers.map((player, i) => [player.name, created.players[i].id]));
  // A category with one group is turned into a knockout by the system; the Vilnius
  // categories with 3+ groups had their brackets built by hand, so they stay round robin.
  const knockoutCategories = Object.entries(byCategory).filter(([, groups]) => groups.length <= 2).map(([label]) => label);
  await saveGroups(adminToken, tournamentId, STRUCTURE.groups.map((group) => ({
    name: group.name,
    tournament_category_id: categoryId[group.category],
    play_format: knockoutCategories.includes(group.category) ? 'groups_knockout' : 'round_robin',
    players: playersByGroup[group.name].map((name) => playerId[name]),
  })));
  log(`Seeded ${seedPlayers.length} players in ${STRUCTURE.groups.length} groups; system knockout for: ${knockoutCategories.join(', ')}`);

  const expectedGroupMatches = STRUCTURE.groups.reduce((sum, group) => sum + (group.size * (group.size - 1)) / 2, 0);
  const slot = await resolveOfficeSlot(tournament.name);
  const officeToken = (await officeLogin(slot)).token;
  const api = async (path, init = {}) => {
    const response = await fetch(new URL(`/api/office/${slot}${path}`, BASE_URL), {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officeToken}`, ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} → ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  };
  const schedule = async () => (await api('/planning')).schedule || [];
  const isPlaced = (entry) => Boolean(entry.court_id && entry.scheduled_time);

  const browser = await launchBrowser(chromium);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL' })).newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(`${error?.message || ''} ${error?.stack || ''}`.slice(0, 600)));
  page.on('dialog', (dialog) => dialog.accept());
  const openView = async (label) => {
    await page.locator('.office-tab').filter({ hasText: label }).click();
    await page.waitForFunction((text) => document.querySelector('.office-tab.is-active')?.textContent?.includes(text), label);
    await page.mouse.move(900, 500);
  };
  const selectDay = async (iso) => {
    await page.locator('.office-daytab').filter({ hasText: ddmm(iso) }).click();
    await page.waitForFunction((label) => document.querySelector('.office-daytab.is-active')?.textContent?.includes(label), ddmm(iso));
  };
  const modal = () => page.locator('.office-modal:visible');
  const fill = async (locator, value) => {
    await locator.fill('');
    if (value !== '' && value != null) await locator.fill(String(value));
    await locator.dispatchEvent('input');
  };

  try {
    const login = new OfficeLoginPage(page, BASE_URL);
    await login.goto(slot);
    await login.login(OFFICE_PASSWORD);
    await openView('Terminarz');
    await page.waitForSelector('.office-timetable__court');

    // ——— B1 on the last three courts, day 09:00–18:00 ———
    const config = await api('/autoschedule/config');
    const courtIds = config.courts.map((court) => String(court.kort_id));
    const b1Target = new Set(courtIds.slice(-3));
    const headers = page.locator('.office-timetable__court');
    for (let index = 0; index < courtIds.length; index += 1) {
      const pill = headers.nth(index).locator('button', { hasText: 'B1' });
      const isOn = await pill.evaluate((node) => node.className.includes('border-emerald-500'));
      if (isOn !== b1Target.has(courtIds[index])) await pill.click();
    }
    await page.locator('.office-toolbar select').selectOption('group');
    await page.locator('.office-toolbar input[type="time"]').nth(0).fill('09:00');
    await page.locator('.office-toolbar input[type="time"]').nth(1).fill('18:00');

    // ——— whole group phase across the days ———
    await page.getByRole('button', { name: 'Rozstaw fazę grupową' }).click();
    await page.getByRole('button', { name: 'Zatwierdź terminarz' }).click();
    const groupRows = await waitUntil('group phase placed', async () => {
      const rows = (await schedule()).filter((entry) => entry.source_type === 'group');
      return rows.length === expectedGroupMatches && rows.every(isPlaced) ? rows : null;
    }, { timeout: 60000 });
    const slotMinutes = (entry) => (b1Target.has(String(entry.court_id)) ? 75 : 60);
    const late = groupRows.filter((entry) => toMinutes(entry.scheduled_time) + slotMinutes(entry) > 18 * 60);
    if (late.length) throw new Error(`${late.length} group matches end after 18:00`);
    const byDayPlayer = new Map();
    for (const entry of groupRows) {
      for (const name of [entry.player1_name, entry.player2_name]) {
        const key = `${entry.day_date}|${name}`;
        const windows = byDayPlayer.get(key) || [];
        const start = toMinutes(entry.scheduled_time);
        const end = start + slotMinutes(entry);
        const clash = windows.find(([s, e]) => start < e && end > s);
        if (clash) throw new Error(`${name} is double-booked on ${entry.day_date} at ${entry.scheduled_time}`);
        windows.push([start, end]);
        byDayPlayer.set(key, windows);
      }
    }
    const b1OnFlex = groupRows.filter((entry) => String(entry.category_name).startsWith('B1') && !b1Target.has(String(entry.court_id)));
    if (b1OnFlex.length) throw new Error(`${b1OnFlex.length} B1 matches outside the B1 courts`);
    const planDays = [...new Set(groupRows.map((entry) => entry.day_date))].sort();
    log(`"Rozstaw fazę grupową": ${groupRows.length} matches on ${planDays.length} days (${planDays.map((day) => `${ddmm(day)}: ${groupRows.filter((entry) => entry.day_date === day).length}`).join(', ')}), all by 18:00, B1 only on B1 courts, nobody double-booked`);

    await page.getByRole('button', { name: 'Opublikuj wszystkie' }).click();
    await waitUntil('group phase published', async () => (await schedule()).filter((entry) => entry.source_type === 'group').every((entry) => entry.status === 'planned'));
    const publicDays = ((await fetchPublicSchedule(tournamentId)).days || []).map((day) => day.date);
    if (planDays.some((day) => !publicDays.includes(day))) throw new Error(`Public schedule days ${publicDays} miss ${planDays}`);
    log(`Published; public schedule shows ${publicDays.length} days`);

    // ——— group stage, day by day ———
    const entered = [];
    const uiKinds = new Set();
    let index = 0;
    for (const day of planDays) {
      const dayRows = groupRows.filter((entry) => entry.day_date === day)
        .sort((left, right) => left.scheduled_time.localeCompare(right.scheduled_time) || String(left.court_id).localeCompare(String(right.court_id)));
      const typedToday = new Set();
      await selectDay(day);
      for (const entry of dayRows) {
        const result = plannedResult(entry, index);
        index += 1;
        if (!typedToday.has(result.kind)) {
          typedToday.add(result.kind);
          uiKinds.add(result.kind);
          const block = page.locator(`[data-schedule-entry][data-schedule-id="${entry.id}"]`);
          await block.scrollIntoViewIfNeeded();
          await block.click();
          await page.locator('.office-inspector').getByRole('button', { name: 'Dodaj wynik' }).click();
          const dialog = modal();
          await dialog.waitFor({ state: 'visible' });
          const numbers = dialog.locator('input[type="number"]');
          const winner = result.winnerIsA ? entry.player1_name : entry.player2_name;
          const loser = result.winnerIsA ? entry.player2_name : entry.player1_name;
          if (result.kind === 'walkover') {
            await dialog.locator('input.toggle-success').check();
            await dialog.locator('label.form-control:visible').filter({ hasText: 'Zwycięzca walkowerem' }).locator('select').selectOption(winner);
          } else {
            await fill(numbers.nth(0), result.sets[0][0]);
            await fill(numbers.nth(1), result.sets[0][1]);
            await fill(numbers.nth(2), result.sets[1][0]);
            await fill(numbers.nth(3), result.sets[1][1]);
            await fill(dialog.locator('.office-tb input').nth(0), result.sets[0][2] ?? '');
            await fill(numbers.nth(4), result.stb ? result.stb[0] : '');
            await fill(numbers.nth(5), result.stb ? result.stb[1] : '');
            if (result.kind === 'retirement') {
              await dialog.locator('input.toggle-warning').check();
              await dialog.locator('label.form-control:visible').filter({ hasText: 'Kto skreczował' }).locator('select').selectOption(loser);
            }
          }
          await dialog.getByRole('button', { name: 'Zapisz wynik' }).click();
          await waitUntil(`UI ${result.kind} for ${entry.id}`, async () => (await schedule()).find((row) => row.id === entry.id)?.match_id);
        } else {
          await api('/group-matches', { method: 'POST', body: JSON.stringify(resultPayload(entry, result)) });
        }
        entered.push({ entry, result });
      }
      const dashboard = await api('/dashboard');
      const groupsDone = (dashboard.progress.groups || []).filter((group) => group.complete).length;
      log(`Day ${ddmm(day)}: ${dayRows.length} results (${[...typedToday].join(', ')} typed in the dialog); ${groupsDone}/${STRUCTURE.groups.length} groups complete`);
    }
    const kinds = entered.reduce((acc, { result }) => ({ ...acc, [result.kind]: (acc[result.kind] || 0) + 1 }), {});
    log(`Group stage: ${entered.length} results — ${Object.entries(kinds).map(([kind, count]) => `${kind} ${count}`).join(', ')}; dialog covered ${[...uiKinds].join(', ')}`);

    // ——— standings: every group against an independent calculation ———
    const bracket = await fetchPublicBracket(tournamentId);
    const standingsByGroup = Object.fromEntries((bracket.groups || []).map((group) => [group.name, group.standings || []]));
    const mismatches = [];
    for (const group of STRUCTURE.groups) {
      const names = playersByGroup[group.name];
      const expected = expectedStandings(names, entered.filter(({ entry }) => names.includes(entry.player1_name) && names.includes(entry.player2_name)));
      const actual = standingsByGroup[group.name] || [];
      if (actual.length !== names.length) mismatches.push(`${group.name}: ${actual.length} rows for ${names.length} players`);
      for (const row of actual) {
        const want = expected[row.name];
        for (const field of ['played', 'wins', 'losses', 'sets_won', 'sets_lost', 'games_won', 'games_lost']) {
          if (!want || row[field] !== want[field]) mismatches.push(`${group.name} ${row.name} ${field}: got ${row[field]}, expected ${want?.[field]}`);
        }
      }
      for (let i = 1; i < actual.length; i += 1) {
        const key = (row) => [row.wins, row.sets_won - row.sets_lost, row.games_won - row.games_lost];
        const [a, b] = [key(actual[i - 1]), key(actual[i])];
        if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) {
          mismatches.push(`${group.name}: ${actual[i - 1].name} ranked above ${actual[i].name} with a worse record`);
        }
      }
    }
    if (mismatches.length) throw new Error(`Standings differ:\n${mismatches.slice(0, 25).join('\n')}`);
    const progress = (await api('/dashboard')).progress;
    const incomplete = (progress.groups || []).filter((group) => !group.complete);
    if (incomplete.length) throw new Error(`Groups not complete: ${incomplete.map((group) => group.name).join(', ')}`);
    log(`Standings: all ${STRUCTURE.groups.length} groups match the independent calculation (wins, sets, games, order); every group complete`);

    // ——— knockout: generated where the system supports it, planned and played ———
    const realNames = new Set(seedPlayers.map((player) => player.name));
    const slots = await waitUntil('knockout slots filled from the final tables', async () => {
      const rows = ((await api('/dashboard')).progress.knockout.matches || []);
      return rows.length && rows.every((row) => realNames.has(row.player1_name) && realNames.has(row.player2_name)) ? rows : null;
    });
    for (const label of knockoutCategories) {
      const group = byCategory[label][0];
      const table = standingsByGroup[group.name];
      const final = slots.find((row) => row.phase === `${group.name} — Finał` || row.phase === `${label} — Finał`);
      if (!final) throw new Error(`No final generated for ${label}: ${slots.map((row) => row.phase).join(', ')}`);
      const finalists = new Set([final.player1_name, final.player2_name]);
      if (!finalists.has(table[0].name) || !finalists.has(table[1].name)) throw new Error(`${label} final is ${[...finalists]}, table top two are ${table[0].name}, ${table[1].name}`);
      if (table.length >= 4) {
        const third = slots.find((row) => /o 3\. miejsce/.test(row.phase) && row.phase.startsWith(group.name.split(' — ')[0]));
        if (!third || !new Set([third.player1_name, third.player2_name]).has(table[2].name)) throw new Error(`${label} 3rd-place match does not hold the table's 3rd and 4th`);
      }
    }
    const multiGroup = Object.keys(byCategory).filter((label) => !knockoutCategories.includes(label));
    log(`Knockout generated: ${slots.length} slots (${slots.map((row) => row.phase).join('; ')}); no automatic bracket for ${multiGroup.length} categories with 3+ groups (${multiGroup.join(', ')})`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await openView('Terminarz');
    await page.locator('.office-toolbar select').selectOption('knockout');
    await page.getByRole('button', { name: 'Rozstaw fazę pucharową' }).click();
    await page.getByRole('button', { name: 'Zatwierdź terminarz' }).click();
    const koRows = await waitUntil('knockout placed', async () => {
      const rows = (await schedule()).filter((entry) => entry.source_type === 'knockout');
      return rows.length >= slots.length && rows.every(isPlaced) ? rows : null;
    });
    log(`"Rozstaw fazę pucharową": ${koRows.length} knockout matches on ${[...new Set(koRows.map((row) => ddmm(row.day_date)))].join(', ')}`);

    await openView('Drabinka');
    for (const row of slots) {
      const card = page.locator('section.office-view:visible article').filter({ hasText: row.player1_name }).filter({ hasText: row.player2_name }).first();
      await card.getByRole('button', { name: 'Dodaj wynik' }).click();
      const dialog = modal();
      await dialog.waitFor({ state: 'visible' });
      const numbers = dialog.locator('input[type="number"]');
      await fill(numbers.nth(0), 4);
      await fill(numbers.nth(1), 3);
      await fill(dialog.locator('.office-tb input').nth(0), 6);
      await fill(numbers.nth(2), 4);
      await fill(numbers.nth(3), 2);
      await dialog.getByRole('button', { name: 'Zapisz wynik' }).click();
      await waitUntil(`knockout ${row.phase}`, async () => ((await api('/dashboard')).progress.knockout.matches || []).find((item) => item.source_ref_id === row.source_ref_id)?.winner_name === row.player1_name);
    }
    const publicKnockout = (await fetchPublicBracket(tournamentId)).knockout || {};
    for (const row of slots) {
      const shown = (publicKnockout[row.phase] || []).find((item) => item.position === row.position);
      if (shown?.winner !== row.player1_name) throw new Error(`Public bracket ${row.phase}: winner ${shown?.winner}, expected ${row.player1_name}`);
    }
    log(`Played ${slots.length} knockout matches in "Drabinka" (with set tie-breaks); public bracket shows every winner`);

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
  }

  if (KEEP) log(`E2E_KEEP=1 — tournament ${tournamentId} left in place`);
  else await cleanup(adminToken);
}

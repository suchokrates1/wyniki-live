/**
 * Module 22: tournament lifecycle at World Championships scale (structure of Vilnius 2026).
 *
 * 8 categories, 29 groups, 107 players, 11 courts, 5 days. Through the office:
 * B1 courts and the day window, "Rozstaw fazę grupową" across days (no double-booked
 * player), publishing, then the whole group stage day by day with every result type
 * (sets, set tie-break, super tie-break, retirement, walkover) — a sample of each per day
 * typed into the result dialog, the rest through the same office endpoints. Standings of
 * every group are recomputed independently and compared. Then the knockout phase in the
 * Vilnius format (top two per group in a seeded main draw, every place played out, the rest
 * in consolation) is checked against the tables, planned with "Rozstaw fazę pucharową" and
 * played day by day in schedule order; every winner and loser must reach the slot the draw
 * names, and the public bracket must agree.
 *
 * Set E2E_KEEP=1 to keep the tournament.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, confirmCategories, saveGroups, cleanup, createTeam,
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
  const confirmed = await confirmCategories(adminToken, tournamentId, [
    ...STRUCTURE.categories.map((category) => ({
      preset_key: category.preset_key, label: category.label, hint_bands: category.hint_bands, is_doubles: false,
    })),
    ...STRUCTURE.doubles.map((category) => ({ label: category.label, hint_bands: category.bands, is_doubles: true })),
  ]);
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
  // Doubles pairs are made of the singles players (they play both), straight knockout as in Vilnius.
  const pairsByDoubles = {};
  for (const doubles of STRUCTURE.doubles) {
    const pool = seedPlayers.filter((player) => doubles.bands.includes(player.category) && player.gender === (doubles.sex === 'Men' ? 'M' : 'K'));
    if (pool.length < doubles.pairs * 2) throw new Error(`${doubles.label}: ${pool.length} players for ${doubles.pairs} pairs`);
    pairsByDoubles[doubles.label] = [];
    for (let i = 0; i < doubles.pairs; i += 1) {
      // partners from different groups: take from both ends of the pool
      const team = await createTeam(adminToken, tournamentId, categoryId[doubles.label], playerId[pool[i].name], playerId[pool[pool.length - 1 - i].name]);
      pairsByDoubles[doubles.label].push(team);
    }
  }
  // Every category goes on to a knockout phase: one group plays final and 3rd place,
  // three or more groups play the Vilnius draw (main draw, places, consolation).
  await saveGroups(adminToken, tournamentId, [
    ...STRUCTURE.groups.map((group) => ({
      name: group.name,
      tournament_category_id: categoryId[group.category],
      play_format: 'groups_knockout',
      players: playersByGroup[group.name].map((name) => playerId[name]),
    })),
    ...STRUCTURE.doubles.map((doubles) => ({
      name: doubles.label,
      tournament_category_id: categoryId[doubles.label],
      play_format: 'knockout',
      teams: pairsByDoubles[doubles.label].map((team) => team.id),
    })),
  ]);
  const pairCount = Object.values(pairsByDoubles).reduce((sum, teams) => sum + teams.length, 0);
  log(`Seeded ${seedPlayers.length} players in ${STRUCTURE.groups.length} groups (all followed by a knockout phase) and ${pairCount} doubles pairs of the same players in ${STRUCTURE.doubles.length} straight knockouts`);

  const expectedGroupMatches = STRUCTURE.groups.reduce((sum, group) => sum + (group.size * (group.size - 1)) / 2, 0);
  const slot = await resolveOfficeSlot(tournament.name);
  const officeToken = (await officeLogin(slot)).token;
  const transportErrors = [];
  const api = async (path, init = {}) => {
    const request = () => fetch(new URL(`/api/office/${slot}${path}`, BASE_URL), {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officeToken}`, ...(init.headers || {}) },
    });
    let response;
    try {
      response = await request();
    } catch (error) {
      // Transport failure only (gunicorn closes idle keep-alive sockets after 2 s); HTTP errors are never retried.
      const cause = error?.cause ? `${error.cause.code || ''} ${error.cause.message || ''}`.trim() : String(error);
      transportErrors.push(`${init.method || 'GET'} ${path}: ${cause}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await request();
    }
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
  const OFFICE_VIEWS = {
    Terminarz: 'planning',
    'Grupy startowe': 'groups',
    'Forma rozgrywek': 'draws',
    'Faza grupowa': 'progress',
    'Faza pucharowa': 'knockout',
    'Ostatnie mecze': 'history',
    'Komunikat dla zawodników': 'quickinfo',
  };
  const openView = async (label) => {
    const tab = page.locator('.office-tab').filter({ hasText: label });
    await page.locator('[data-office-next] .office-next__dismiss').click({ timeout: 1500 }).catch(() => {});
    try {
      await tab.click({ force: true, timeout: 8000 });
    } catch {
      const view = OFFICE_VIEWS[label];
      if (!view) throw new Error(`Could not open office view ${label}`);
      await page.evaluate(async (id) => {
        const app = Alpine.$data(document.body);
        await app.openOfficeView(id);
        await Alpine.nextTick();
      }, view);
    }
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
    await page.waitForFunction(() => {
      const app = Alpine.$data(document.body);
      return app?.planningLoadedOnce && app?.drawFormatsLoaded && !app?.planningLoading;
    }, undefined, { timeout: 30000 });
    await page.locator('[data-office-next] .office-next__dismiss').click({ timeout: 3000 }).catch(() => {});
    await openView('Terminarz');
    await page.waitForSelector('.office-timetable__court');

    // ——— B1 on the last three courts, day 09:00–18:00 ———
    const config = await api('/autoschedule/config');
    const courtIds = config.courts.map((court) => String(court.kort_id));
    const b1Target = new Set(courtIds.slice(-4)); // Vilnius played B1 on four courts
    const headers = page.locator('.office-timetable__court');
    for (let index = 0; index < courtIds.length; index += 1) {
      const pill = headers.nth(index).locator('button', { hasText: 'B1' });
      const isOn = await pill.evaluate((node) => node.className.includes('border-emerald-500'));
      if (isOn !== b1Target.has(courtIds[index])) await pill.click();
    }
    await page.locator('.office-toolbar select').selectOption('group');
    await page.locator('.office-daybar input[type="time"]').nth(0).fill('09:00');
    await page.locator('.office-daybar input[type="time"]').nth(1).fill('18:00');

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
    await page.locator('[data-publish-confirm]').click();
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
    const singlesGroupNames = new Set(STRUCTURE.groups.map((group) => group.name));
    const incomplete = (progress.groups || []).filter((group) => singlesGroupNames.has(group.name) && !group.complete);
    if (incomplete.length) throw new Error(`Groups not complete: ${incomplete.map((group) => group.name).join(', ')}`);
    log(`Standings: all ${STRUCTURE.groups.length} groups match the independent calculation (wins, sets, games, order); every group complete`);

    // ——— knockout: Vilnius format for every category ———
    const realNames = new Set(seedPlayers.map((player) => player.name));
    const isReal = (name) => realNames.has(name) || (String(name || '').includes(' / ') && String(name).split(' / ').every((part) => realNames.has(part)));
    const koProgress = async () => ((await api('/dashboard')).progress.knockout.matches || []);
    const firstRound = await waitUntil('knockout draws seeded from the final tables', async () => {
      const rows = await koProgress();
      const categoriesWithDraw = new Set(rows.map((row) => String(row.phase).split(' — ')[0]));
      const seeded = rows.filter((row) => isReal(row.player1_name) || isReal(row.player2_name));
      const noStandingPlaceholders = rows.every((row) => ![row.player1_name, row.player2_name].some((name) => /^\d+\.\s/.test(String(name))));
      return categoriesWithDraw.size === STRUCTURE.categories.length + STRUCTURE.doubles.length && noStandingPlaceholders ? { rows, seeded } : null;
    }, { timeout: 60000 });
    const koSlots = firstRound.rows;
    const groupOf = Object.fromEntries(Object.entries(playersByGroup).flatMap(([group, names]) => names.map((name) => [name, group])));
    const rankOf = Object.fromEntries(Object.values(standingsByGroup).flatMap((rows) => rows.map((row, index) => [row.name, index + 1])));

    // every player lands in exactly one draw: top two in the main draw, the rest in consolation
    for (const [label, groups] of Object.entries(byCategory)) {
      const rows = koSlots.filter((row) => String(row.phase).startsWith(`${label} — `));
      const seededNames = (predicate) => new Set(rows.filter(predicate).flatMap((row) => [row.player1_name, row.player2_name]).filter(isReal));
      if (groups.length === 1) {
        const table = standingsByGroup[groups[0].name];
        const final = rows.find((row) => /— Finał$/.test(row.phase));
        if (!final || new Set([final.player1_name, final.player2_name]).size !== 2 || ![table[0].name, table[1].name].every((name) => [final.player1_name, final.player2_name].includes(name))) {
          throw new Error(`${label}: final should be ${table[0].name} v ${table[1].name}, got ${JSON.stringify(final)}`);
        }
        continue;
      }
      const main = seededNames((row) => !/Pocieszenie/.test(row.phase));
      const consolation = seededNames((row) => /Pocieszenie/.test(row.phase));
      for (const group of groups) {
        for (const [index, row] of standingsByGroup[group.name].entries()) {
          const inMain = main.has(row.name);
          const inConsolation = consolation.has(row.name);
          if (index < 2 && (!inMain || inConsolation)) throw new Error(`${label}: ${row.name} (${index + 1}. ${group.name}) should be in the main draw only`);
          if (index >= 2 && (inMain || !inConsolation)) throw new Error(`${label}: ${row.name} (${index + 1}. ${group.name}) should be in consolation only`);
        }
      }
      const sameGroupOpeners = rows.filter((row) => isReal(row.player1_name) && isReal(row.player2_name) && groupOf[row.player1_name] === groupOf[row.player2_name]);
      if (sameGroupOpeners.length) throw new Error(`${label}: group mates meet in their first match: ${sameGroupOpeners.map((row) => `${row.player1_name} v ${row.player2_name}`).join(', ')}`);
    }
    const b2Quarters = koSlots.filter((row) => row.phase === 'B2 Men — Ćwierćfinał').sort((a, b) => a.position - b.position)
      .map((row) => `${groupOf[row.player1_name].slice(-1)}${rankOf[row.player1_name]}-${groupOf[row.player2_name].slice(-1)}${rankOf[row.player2_name]}`);
    if (b2Quarters.join(' ') !== 'A1-B2 D1-C2 B1-A2 C1-D2') throw new Error(`B2 Men quarterfinals ${b2Quarters.join(' ')}, expected A1-B2 D1-C2 B1-A2 C1-D2`);
    const draws = Object.keys(byCategory).map((label) => {
      const rows = koSlots.filter((row) => String(row.phase).startsWith(`${label} — `));
      const main = rows.filter((row) => !/Pocieszenie/.test(row.phase));
      const fraction = main.map((row) => row.phase.match(/— (1\/\d+) finału$/)?.[1]).find(Boolean);
      const opener = fraction || (main.some((row) => /— Ćwierćfinał$/.test(row.phase)) ? 'QF' : (main.some((row) => /— Półfinał$/.test(row.phase)) ? 'SF' : 'F'));
      return `${label} ${rows.length} (${opener}${rows.some((row) => /Pocieszenie/.test(row.phase)) ? ' + pocieszenie' : ''})`;
    });
    const doublesDraws = STRUCTURE.doubles.map((doubles) => {
      const rows = koSlots.filter((row) => String(row.phase).startsWith(`${doubles.label} — `));
      const expected = doubles.pairs - 1 + (doubles.pairs >= 4 ? 1 : 0);
      if (rows.length !== expected) throw new Error(`${doubles.label}: ${rows.length} matches for ${doubles.pairs} pairs, expected ${expected}`);
      const seeded = new Set(rows.flatMap((row) => [row.player1_name, row.player2_name]).filter((name) => / \/ /.test(String(name))));
      if (seeded.size !== doubles.pairs) throw new Error(`${doubles.label}: ${seeded.size} pairs in the draw, expected ${doubles.pairs}`);
      return `${doubles.label} ${rows.length}`;
    });
    log(`Knockout draws: ${koSlots.length} matches — ${draws.join(', ')}; doubles ${doublesDraws.join(', ')}; top two in main draws, the rest in consolation, no group mates in an opener; B2 Men QF A1-B2 D1-C2 B1-A2 C1-D2`);

    // ——— plan the knockout phase across the remaining days ———
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await openView('Terminarz');
    await page.locator('.office-toolbar select').selectOption('knockout');
    await page.getByRole('button', { name: 'Rozstaw fazę pucharową' }).click();
    await page.getByRole('button', { name: 'Zatwierdź terminarz' }).click();
    const koRows = await waitUntil('knockout placed', async () => {
      const rows = (await schedule()).filter((entry) => entry.source_type === 'knockout');
      return rows.length >= koSlots.length && rows.every(isPlaced) ? rows : null;
    }, { timeout: 60000 }).catch(async (error) => {
      const rows = (await schedule()).filter((entry) => entry.source_type === 'knockout');
      throw new Error(`${error.message}: ${rows.filter((row) => !isPlaced(row)).length} of ${rows.length} unplaced, e.g. ${JSON.stringify(rows.filter((row) => !isPlaced(row)).slice(0, 5).map((row) => row.phase))}`);
    });
    const lateKo = koRows.filter((entry) => toMinutes(entry.scheduled_time) + slotMinutes(entry) > 18 * 60);
    if (lateKo.length) throw new Error(`${lateKo.length} knockout matches end after 18:00`);
    const lastGroupEnd = {};
    for (const entry of groupRows) {
      const root = String(entry.category_name).split(' — ')[0];
      const end = `${entry.day_date} ${String(toMinutes(entry.scheduled_time) + slotMinutes(entry)).padStart(4, '0')}`;
      if (!lastGroupEnd[root] || end > lastGroupEnd[root]) lastGroupEnd[root] = end;
    }
    for (const row of koRows) {
      const root = String(row.phase).split(' — ')[0];
      const start = `${row.day_date} ${String(toMinutes(row.scheduled_time)).padStart(4, '0')}`;
      if (lastGroupEnd[root] && start < lastGroupEnd[root]) throw new Error(`${row.phase} starts ${row.day_date} ${row.scheduled_time}, before the ${root} group phase ends`);
    }
    // nobody is on two courts at once: singles, doubles (both partners) and knockout together
    const people = (entry) => [entry.player1_name, entry.player2_name]
      .flatMap((name) => String(name || '').split(' / '))
      .filter((name) => realNames.has(name));
    const busy = new Map();
    for (const entry of [...groupRows, ...koRows]) {
      const start = toMinutes(entry.scheduled_time);
      const end = start + slotMinutes(entry);
      for (const person of people(entry)) {
        const key = `${entry.day_date}|${person}`;
        const clash = (busy.get(key) || []).find(([from, to]) => start < to && end > from);
        if (clash) throw new Error(`${person} is on two courts on ${entry.day_date} at ${entry.scheduled_time} (${entry.phase})`);
        busy.set(key, [...(busy.get(key) || []), [start, end]]);
      }
    }
    const koDays = [...new Set(koRows.map((row) => row.day_date))].sort();
    log(`"Rozstaw fazę pucharową": ${koRows.length} matches on ${koDays.map((day) => `${ddmm(day)}: ${koRows.filter((row) => row.day_date === day).length}`).join(', ')}, all after the group phase and by 18:00; no player (singles or doubles partner) on two courts at once`);

    // ——— play the knockout phase in schedule order ———
    const koKinds = ['tiebreak', 'straight', 'supertb', 'straight', 'walkover', 'straight', 'retirement', 'straight'];
    const slotTarget = (feed) => {
      if (!feed) return null;
      const [phase, position, side] = String(feed).split('|');
      return { phase, position: Number(position), side: Number(side) };
    };
    const playedKo = [];
    const dialogRetries = [];
    let koIndex = 0;
    for (const day of koDays) {
      const dayRows = koRows.filter((row) => row.day_date === day)
        .sort((left, right) => left.scheduled_time.localeCompare(right.scheduled_time) || String(left.court_id).localeCompare(String(right.court_id)));
      const typedToday = new Set();
      await selectDay(day);
      for (const entry of dayRows) {
        const current = (await koProgress()).find((row) => row.schedule_id === entry.id);
        if (!current || !isReal(current.player1_name) || !isReal(current.player2_name)) {
          throw new Error(`${entry.phase} on ${day} ${entry.scheduled_time} has no confirmed players at its time: ${current?.player1_name} v ${current?.player2_name}`);
        }
        const kind = koKinds[koIndex % koKinds.length];
        koIndex += 1;
        const shaped = plannedResult({ id: entry.id }, KINDS.indexOf(kind));
        const winner = shaped.winnerIsA ? current.player1_name : current.player2_name;
        const loser = shaped.winnerIsA ? current.player2_name : current.player1_name;
        if (!typedToday.has(kind) && ['tiebreak', 'walkover', 'retirement'].includes(kind)) {
          typedToday.add(kind);
          // the office view learns about results entered elsewhere a moment later; reload if it lags
          const uiKnows = () => page.waitForFunction(([id, a, b]) => {
            const rows = Alpine.$data(document.body).dashboard?.progress?.knockout?.matches || [];
            const row = rows.find((item) => Number(item.schedule_id) === id);
            return row && row.player1_name === a && row.player2_name === b;
          }, [entry.id, current.player1_name, current.player2_name], { timeout: 6000 });
          try {
            await uiKnows();
          } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.office-rail', { state: 'visible' });
            await openView('Terminarz');
            await selectDay(day);
            await uiKnows();
          }
          const block = page.locator(`[data-schedule-entry][data-schedule-id="${entry.id}"]`);
          const dialog = modal();
          for (let attempt = 1; ; attempt += 1) {
            await block.scrollIntoViewIfNeeded();
            const openId = await page.evaluate(() => Alpine.$data(document.body).planningOpenCardId);
            if (String(openId) !== String(entry.id)) await block.click();
            await page.locator('.office-inspector').getByRole('button', { name: 'Dodaj wynik' }).click();
            await dialog.waitFor({ state: 'visible' });
            const form = await page.evaluate(() => {
              const m = Alpine.$data(document.body).officeNewMatch;
              return { id: m.schedule_id, a: m.player1_name, b: m.player2_name };
            });
            if (String(form.id) === String(entry.id) && form.a === current.player1_name && form.b === current.player2_name) break;
            dialogRetries.push(`${entry.phase}: dialog had ${form.id} ${form.a} v ${form.b}`);
            if (attempt >= 3) throw new Error(`Result dialog for ${entry.phase} keeps showing ${JSON.stringify(form)}, expected ${entry.id} ${current.player1_name} v ${current.player2_name}`);
            await page.evaluate(() => Alpine.$data(document.body).closeAddMatchModal());
            await uiKnows();
          }
          const numbers = dialog.locator('input[type="number"]');
          if (kind === 'walkover') {
            await dialog.locator('input.toggle-success').check();
            await dialog.locator('label.form-control:visible').filter({ hasText: 'Zwycięzca walkowerem' }).locator('select').selectOption(winner);
          } else {
            await fill(numbers.nth(0), shaped.sets[0][0]);
            await fill(numbers.nth(1), shaped.sets[0][1]);
            await fill(numbers.nth(2), shaped.sets[1][0]);
            await fill(numbers.nth(3), shaped.sets[1][1]);
            await fill(dialog.locator('.office-tb input').nth(0), shaped.sets[0][2] ?? '');
            if (kind === 'retirement') {
              await dialog.locator('input.toggle-warning').check();
              const retiredSelect = dialog.locator('label.form-control:visible').filter({ hasText: 'Kto skreczował' }).locator('select');
              await retiredSelect.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
              const options = await retiredSelect.locator('option').evaluateAll((items) => items.map((item) => item.value));
              if (!options.includes(loser)) {
                const form = await page.evaluate(() => {
                  const m = Alpine.$data(document.body).officeNewMatch;
                  return { id: m.schedule_id, mode: m.mode, a: m.player1_name, b: m.player2_name, retirement: m.retirement };
                });
                const html = await dialog.locator('select[x-model="officeNewMatch.retired_player_name"]').evaluateAll((items) => items.map((item) => item.outerHTML.slice(0, 600)));
                throw new Error(`Retirement options ${JSON.stringify(options)} miss ${loser}; form ${JSON.stringify(form)}; entry ${entry.id} ${entry.phase}; selects ${JSON.stringify(html)}`);
              }
              await retiredSelect.selectOption(loser);
            }
          }
          await dialog.getByRole('button', { name: 'Zapisz wynik' }).click();
        } else {
          const body = { schedule_id: entry.id };
          if (kind === 'walkover') Object.assign(body, { walkover: true, winner_name: winner, sets: [] });
          else {
            body.sets = shaped.sets.map(([p1, p2, tb]) => ({ player1_games: p1, player2_games: p2, ...(tb != null ? { tiebreak_loser_points: tb } : {}) }));
            if (shaped.stb) body.sets.push({ player1_games: shaped.stb[0], player2_games: shaped.stb[1], is_super_tiebreak: true });
            if (kind === 'retirement') Object.assign(body, { retirement: true, retired_player_name: loser });
          }
          await api('/knockout-matches', { method: 'POST', body: JSON.stringify(body) });
        }
        const after = await waitUntil(`${entry.phase} #${current.position} recorded`, async () => {
          const rows = await koProgress();
          const row = rows.find((item) => item.schedule_id === entry.id);
          return row?.winner_name ? rows : null;
        }).catch(async (error) => {
          const toasts = await page.locator('.toast .alert').allInnerTexts().catch(() => []);
          const dialogOpen = await modal().isVisible().catch(() => false);
          const form = await page.evaluate(() => {
            const data = Alpine.$data(document.body);
            const m = data.officeNewMatch || {};
            return { mode: m.mode, phase: m.phase, p1: m.player1_name, p2: m.player2_name, schedule_id: m.schedule_id, walkover: m.walkover, retirement: m.retirement, retired: m.retired_player_name, winner: m.winner_name, sets: [m.set1_p1, m.set1_p2, m.set1_tb, m.set2_p1, m.set2_p2] };
          }).catch((e) => String(e));
          throw new Error(`${error.message} (kind ${kind}, ${current.player1_name} v ${current.player2_name}); dialog open: ${dialogOpen}; toasts: ${toasts.join(' | ')}; form: ${JSON.stringify(form)}`);
        });
        const row = after.find((item) => item.schedule_id === entry.id);
        if (row.winner_name !== winner) throw new Error(`${entry.phase}: winner ${row.winner_name}, expected ${winner}`);
        for (const [feed, name] of [[current.winner_to, winner], [current.loser_to, loser]]) {
          const next = slotTarget(feed);
          if (!next) continue;
          const nextRow = after.find((item) => item.phase === next.phase && item.position === next.position);
          const seated = next.side === 1 ? nextRow?.player1_name : nextRow?.player2_name;
          if (seated !== name) throw new Error(`${entry.phase} #${current.position}: ${name} should move to ${next.phase} #${next.position} side ${next.side}, found ${seated}`);
        }
        playedKo.push({ phase: entry.phase, position: current.position, winner, kind });
      }
      log(`Knockout day ${ddmm(day)}: ${dayRows.length} matches played in schedule order (${[...typedToday].join(', ')} typed in the dialog); every winner and loser moved to the slot the draw names`);
    }

    // ——— final state: all slots decided, public bracket agrees, podiums complete ———
    const finalKo = await koProgress();
    const undecided = finalKo.filter((row) => !row.winner_name);
    if (undecided.length) throw new Error(`${undecided.length} knockout matches without a result: ${undecided.slice(0, 5).map((row) => row.phase).join(', ')}`);
    const publicKnockout = (await fetchPublicBracket(tournamentId)).knockout || {};
    for (const row of finalKo) {
      const shown = (publicKnockout[row.phase] || []).find((item) => item.position === row.position);
      if (shown?.winner !== row.winner_name) throw new Error(`Public bracket ${row.phase} #${row.position}: winner ${shown?.winner}, expected ${row.winner_name}`);
    }
    const champions = [...Object.keys(byCategory), ...STRUCTURE.doubles.map((doubles) => doubles.label)].map((label) => {
      const final = finalKo.find((row) => row.phase === `${label} — Finał` || (byCategory[label] && row.phase === `${byCategory[label][0].name} — Finał`));
      return `${label}: ${final?.winner_name?.split(' ')[0]}`;
    });
    const kindsPlayed = playedKo.reduce((acc, { kind }) => ({ ...acc, [kind]: (acc[kind] || 0) + 1 }), {});
    log(`Knockout complete: ${finalKo.length} matches (${Object.entries(kindsPlayed).map(([kind, count]) => `${kind} ${count}`).join(', ')}); public bracket shows every winner; champions ${champions.join(', ')}`);

    if (dialogRetries.length) log(`Result dialog reopened ${dialogRetries.length}×: ${dialogRetries.join('; ')}`);
    if (transportErrors.length) log(`Transport retries: ${transportErrors.length} (${[...new Set(transportErrors.map((entry) => entry.split(': ').pop()))].join('; ')})`);
    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
  }

  if (KEEP) log(`E2E_KEEP=1 — tournament ${tournamentId} left in place`);
  else await cleanup(adminToken);
}

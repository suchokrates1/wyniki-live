/**
 * Module 21: a whole tournament run through the office UI, every save verified through the API.
 *
 * Categories, players, pairs and the draw; generating matches; a two-day plan with the
 * auto-scheduler, the drawer and drag and drop; publishing; editing a match (time, court,
 * public note); results on both days (sets, walkover, doubles, correction); closing a group
 * and a knockout result; the viewer banner (publish, edit, hide); rematches; "Wyczyść dzień";
 * deleting unassigned matches.
 *
 * Only the tournament itself and the seed players are created through the admin API: the
 * office cannot create a tournament. Set E2E_KEEP=1 to keep the tournament for inspection.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, cleanup, resolveOfficeSlot, officeLogin, OFFICE_PASSWORD,
  fetchPublicSchedule,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const KEEP = process.env.E2E_KEEP === '1';

const isoDay = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const ddmm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const log = (message) => console.log(`  ${message}`);

async function waitUntil(label, probe, { timeout = 20000, interval = 400 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await probe();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

export default async function run() {
  const adminToken = await adminLogin();
  const day1 = isoDay(0);
  const day2 = isoDay(1);
  const tournament = await createTournament(adminToken, {
    startDate: day1, endDate: day2, courts: 4, isSimulation: false, isPublic: true,
  });
  const tournamentId = tournament.id;
  const tag = tournament.name.split(' ')[0];
  log(`Tournament ${tournamentId} "${tournament.name}" ${day1}…${day2}`);

  const seed = [
    ...['Adam', 'Bartek', 'Cezary', 'Dawid'].map((first) => ({ first, category: 'B1', gender: 'M' })),
    ...['Ewa', 'Fiona', 'Gosia', 'Hania', 'Iga', 'Julia'].map((first) => ({ first, category: 'B2', gender: 'K' })),
    ...['Kamil', 'Lena', 'Marek', 'Nina', 'Olek', 'Pola', 'Rafał', 'Sara'].map((first, i) => ({ first, category: 'B3', gender: i % 2 ? 'K' : 'M' })),
  ].map(({ first, category, gender }) => ({
    name: `${first} ${tag}`, first_name: first, last_name: tag, category, gender, country: 'PL',
  }));
  await addPlayers(adminToken, tournamentId, seed);
  log(`Seeded ${seed.length} players through the admin API`);

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
  const planning = () => api('/planning');
  const dashboard = () => api('/dashboard');
  const isPlaced = (entry) => Boolean(entry.court_id && entry.scheduled_time);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('dialog', (dialog) => dialog.accept());

  const openView = async (label) => {
    await page.locator('.office-tab').filter({ hasText: label }).click();
    await page.waitForFunction((text) => document.querySelector('.office-tab.is-active')?.textContent?.includes(text), label, { timeout: 10000 });
    await page.mouse.move(900, 500);
  };
  const toast = async (text) => page.waitForFunction(
    (needle) => [...document.querySelectorAll('.toast .alert')].some((node) => node.offsetParent && node.textContent.includes(needle)),
    text,
    { timeout: 15000 },
  );
  const modal = () => page.locator('.office-modal:visible');
  const fillNumber = async (locator, value) => {
    await locator.fill('');
    await locator.fill(String(value));
    await locator.dispatchEvent('input');
  };
  const selectDay = async (iso) => {
    await page.locator('.office-daytab').filter({ hasText: ddmm(iso) }).click();
    await page.waitForFunction((label) => document.querySelector('.office-daytab.is-active')?.textContent?.includes(label), ddmm(iso));
  };
  const block = (id) => page.locator(`[data-schedule-entry][data-schedule-id="${id}"]`);
  const drawerCard = (id) => page.locator(`[data-unassigned-entry][data-schedule-id="${id}"]`);

  try {
    // ——— login ———
    const login = new OfficeLoginPage(page, BASE_URL);
    await login.goto(slot);
    await login.login(OFFICE_PASSWORD);
    log('Office login through the UI');

    // ——— categories ———
    await openView('Grupy startowe');
    const presetBox = (label) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('input.checkbox-primary');
    await presetBox('B1 M').check();
    await presetBox('B2 K').check();
    await page.locator('input[placeholder*="B2 Mixed"]:visible').first().fill('B3 Double');
    await page.locator('input[placeholder="B2 / B3,B4"]:visible').fill('B3');
    await page.locator('label.mt-2:visible').filter({ hasText: 'Debel' }).locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Zatwierdź kategorie' }).click();
    const categories = await waitUntil('three categories', async () => {
      const cats = (await planning()).tournament_categories || [];
      return cats.length === 3 ? cats : null;
    });
    const catB1 = categories.find((cat) => cat.label.startsWith('B1'));
    const catB2 = categories.find((cat) => cat.label.startsWith('B2'));
    const catDbl = categories.find((cat) => cat.is_doubles);
    if (!catB1 || !catB2 || !catDbl) throw new Error(`Unexpected categories: ${JSON.stringify(categories)}`);
    log(`Categories: ${categories.map((cat) => cat.label).join(', ')}`);

    // ——— two more players through the office form ———
    await page.getByRole('button', { name: '+ Dodaj zawodnika' }).click();
    const playerForm = page.locator('div.grid').filter({ has: page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }) }).last();
    for (const first of ['Tola', 'Ula']) {
      await playerForm.getByPlaceholder('Imię').fill(first);
      await playerForm.getByPlaceholder('Nazwisko').fill(tag);
      await playerForm.locator('select').nth(0).selectOption('B2');
      await playerForm.locator('select').nth(1).selectOption('K');
      await playerForm.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
      await toast('Zawodnik dodany');
    }
    await waitUntil('22 players', async () => ((await planning()).players || []).length === 22);
    log('Added 2 players through the office form (22 total)');

    // ——— draw: B2 K into two groups, B1 M into one ———
    const divisionCard = (label) => page.locator('.office-groups button.rounded-2xl').filter({ hasText: label }).first();
    await divisionCard(catB2.label).click();
    await page.locator('.office-groups button').filter({ hasText: /^\+$/ }).click();
    await page.getByRole('button', { name: 'Rozdziel automatycznie' }).click();
    await waitUntil('B2 K in two groups of four', async () => {
      const groups = ((await planning()).groups || []).filter((group) => Number(group.tournament_category_id) === Number(catB2.id));
      return groups.length === 2 && groups.every((group) => group.players.length === 4);
    });
    log(`${catB2.label}: two groups of four`);

    await divisionCard(catB1.label).click();
    await page.getByRole('button', { name: 'Przypisz wszystkich' }).click();
    await waitUntil('B1 M in one group of four', async () => {
      const groups = ((await planning()).groups || []).filter((group) => Number(group.tournament_category_id) === Number(catB1.id));
      return groups.length === 1 && groups[0].players.length === 4;
    });
    log(`${catB1.label}: one group of four`);

    // ——— doubles: four pairs through the form, then the draw ———
    await divisionCard(catDbl.label).click();
    const addTeamToggle = page.getByRole('button', { name: '+ Dodaj drużynę' });
    if (await addTeamToggle.isVisible().catch(() => false)) await addTeamToggle.click();
    const teamForm = page.locator('div.mt-3.grid').filter({ has: page.getByRole('button', { name: 'Dodaj drużynę', exact: true }) });
    await teamForm.waitFor({ state: 'visible', timeout: 8000 });
    for (let pair = 0; pair < 4; pair += 1) {
      const first = await teamForm.locator('select').nth(0).locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean)[0]);
      if (!first) throw new Error(`No partner left for pair ${pair + 1}`);
      await teamForm.locator('select').nth(0).selectOption(first);
      const second = await teamForm.locator('select').nth(1).locator('option').evaluateAll((options, taken) => options.map((option) => option.value).filter((value) => value && value !== taken)[0], first);
      await teamForm.locator('select').nth(1).selectOption(second);
      await teamForm.getByRole('button', { name: 'Dodaj drużynę', exact: true }).click();
      await waitUntil(`pair ${pair + 1}`, async () => ((await planning()).teams || []).length === pair + 1);
    }
    await page.getByRole('button', { name: 'Przypisz wszystkie pary' }).click();
    await waitUntil('doubles group of four pairs', async () => {
      const groups = ((await planning()).groups || []).filter((group) => Number(group.tournament_category_id) === Number(catDbl.id));
      return groups.length === 1 && groups[0].players.length === 4 && groups[0].players.every((row) => row.team_id);
    });
    log(`${catDbl.label}: four pairs added through the form and drawn into one group`);

    // ——— matches ———
    await openView('Terminarz');
    await page.getByRole('button', { name: 'Generuj mecze' }).click();
    const groupEntries = await waitUntil('24 group matches', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
      return rows.length === 24 ? rows : null;
    });
    log(`Generated ${groupEntries.length} group matches`);

    // ——— day 1 plan with the auto-scheduler ———
    await selectDay(day1);
    await page.locator('.office-toolbar select').selectOption('group');
    await page.locator('.office-toolbar input[type="time"]').fill('09:00');
    await page.getByRole('button', { name: 'Generuj propozycję' }).click();
    await page.getByRole('button', { name: 'Zatwierdź terminarz' }).click();
    const day1Placed = await waitUntil('day 1 placements', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.day_date === day1 && isPlaced(entry));
      return rows.length ? rows : null;
    });
    log(`Day 1: auto-scheduler placed ${day1Placed.length} matches`);

    // take six matches off day 1 into the drawer (drag onto the drawer)
    await page.waitForSelector('[data-schedule-entry]');
    const toMove = day1Placed.slice(-6);
    for (const entry of toMove) {
      await block(entry.id).scrollIntoViewIfNeeded();
      await block(entry.id).dragTo(page.locator('.office-drawer'));
      await waitUntil(`entry ${entry.id} in the drawer`, async () => {
        const row = ((await planning()).schedule || []).find((item) => item.id === entry.id);
        return row && !isPlaced(row);
      });
    }
    await drawerCard(toMove[0].id).waitFor({ state: 'visible' });
    log('Dragged 6 matches from the day 1 board into the drawer');

    // ——— day 2 plan: drag the six drawer cards onto the day 2 board ———
    // The auto-scheduler only proposes matches already dated for the selected day, and group
    // matches start on day 1, so a second day is built from the drawer.
    await selectDay(day2);
    const courtIds = (await api('/autoschedule/config')).courts.map((court) => String(court.kort_id));
    for (const [index, entry] of toMove.entries()) {
      const court = courtIds[index % courtIds.length];
      const cellId = await page.evaluate((wanted) => {
        const cells = [...document.querySelectorAll('[data-cell]')].filter((node) => node.getAttribute('data-cell').startsWith(`${wanted}|`));
        const empty = cells.find((node) => !node.querySelector('[data-schedule-entry]'));
        return (empty || cells[0])?.getAttribute('data-cell') || null;
      }, court);
      if (!cellId) throw new Error(`No cell for court ${court} on day 2`);
      const cell = page.locator(`[data-cell="${cellId}"]`);
      await cell.scrollIntoViewIfNeeded();
      await drawerCard(entry.id).dragTo(cell);
      await waitUntil(`entry ${entry.id} on day 2, court ${court}`, async () => {
        const row = ((await planning()).schedule || []).find((item) => item.id === entry.id);
        return row && row.day_date === day2 && String(row.court_id) === court && Boolean(row.scheduled_time);
      });
    }
    const day2Placed = ((await planning()).schedule || []).filter((entry) => entry.day_date === day2 && isPlaced(entry));
    log(`Day 2: dragged ${day2Placed.length} matches from the drawer onto courts ${[...new Set(day2Placed.map((entry) => entry.court_id))].join(', ')}`);

    // move a day 2 match to another court by dragging it on the board
    const mover = day2Placed[0];
    const otherCourt = courtIds.find((court) => court !== String(mover.court_id));
    const moverCell = await page.evaluate((wanted) => (
      [...document.querySelectorAll('[data-cell]')].find((node) => node.getAttribute('data-cell').startsWith(`${wanted}|`) && !node.querySelector('[data-schedule-entry]'))
      || [...document.querySelectorAll('[data-cell]')].find((node) => node.getAttribute('data-cell').startsWith(`${wanted}|`))
    )?.getAttribute('data-cell'), otherCourt);
    await block(mover.id).scrollIntoViewIfNeeded();
    await block(mover.id).dragTo(page.locator(`[data-cell="${moverCell}"]`));
    await waitUntil(`match ${mover.id} on court ${otherCourt}`, async () => {
      const row = ((await planning()).schedule || []).find((item) => item.id === mover.id);
      return row && String(row.court_id) === otherCourt && row.day_date === day2;
    });
    log(`Board drag: match ${mover.id} moved from court ${mover.court_id} to court ${otherCourt}`);

    // ——— publish ———
    await page.getByRole('button', { name: 'Opublikuj wszystkie' }).click();
    await waitUntil('placed matches published', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group' && isPlaced(entry));
      return rows.length && rows.every((entry) => entry.status === 'planned');
    });
    const publicSchedule = await fetchPublicSchedule(tournamentId);
    const publicRows = Array.isArray(publicSchedule) ? publicSchedule : (publicSchedule.schedule || publicSchedule.entries || []);
    if (!publicRows.length) throw new Error('Public schedule is empty after publishing');
    log(`Published; public schedule lists ${publicRows.length} entries`);

    // ——— inspector: time, court and public note ———
    await selectDay(day1);
    const edited = ((await planning()).schedule || []).find((entry) => entry.day_date === day1 && isPlaced(entry) && entry.source_type === 'group');
    await block(edited.id).scrollIntoViewIfNeeded();
    await block(edited.id).click();
    const inspector = page.locator('.office-inspector');
    const courts = await inspector.locator('select').nth(0).locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
    const newCourt = courts.find((court) => String(court) !== String(edited.court_id));
    const note = `Zmiana kortu ${tag}`;
    await inspector.locator('input[type="time"]').fill('18:30');
    await inspector.locator('select').nth(0).selectOption(newCourt);
    await inspector.locator('input[type="text"]').fill(note);
    await inspector.getByRole('button', { name: 'Zapisz', exact: true }).click();
    await waitUntil('inspector edit saved', async () => {
      const row = ((await planning()).schedule || []).find((item) => item.id === edited.id);
      return row && row.scheduled_time === '18:30' && String(row.court_id) === String(newCourt) && row.notes_public === note;
    });
    log(`Inspector: match ${edited.id} moved to court ${newCourt} at 18:30 with a public note`);

    // ——— results ———
    const addResultFromBoard = async (entry, { sets = [[4, 1], [4, 2]], walkover = false } = {}) => {
      await selectDay(entry.day_date);
      await block(entry.id).scrollIntoViewIfNeeded();
      await block(entry.id).click();
      await inspector.getByRole('button', { name: 'Dodaj wynik' }).click();
      const dialog = modal();
      await dialog.waitFor({ state: 'visible' });
      if (walkover) {
        await dialog.locator('input.toggle').check();
        const winnerSelect = dialog.locator('label.form-control').filter({ hasText: 'Zwycięzca walkowerem' }).locator('select');
        await winnerSelect.selectOption({ index: 1 });
      } else {
        const inputs = dialog.locator('input[type="number"]');
        await fillNumber(inputs.nth(0), sets[0][0]);
        await fillNumber(inputs.nth(1), sets[0][1]);
        await fillNumber(inputs.nth(2), sets[1][0]);
        await fillNumber(inputs.nth(3), sets[1][1]);
      }
      await dialog.getByRole('button', { name: 'Zapisz wynik' }).click();
      return waitUntil(`result for schedule ${entry.id}`, async () => {
        const row = ((await planning()).schedule || []).find((item) => item.id === entry.id);
        return row?.match_id ? row : null;
      });
    };

    const schedule = () => planning().then((body) => body.schedule || []);
    const open = (rows, predicate) => rows.filter((entry) => entry.source_type === 'group' && isPlaced(entry) && !entry.match_id && predicate(entry));

    let rows = await schedule();
    const singlesDay1 = open(rows, (entry) => entry.day_date === day1 && !String(entry.player1_name).includes(' / '))[0];
    const withSets = await addResultFromBoard(singlesDay1);
    log(`Result with sets on day 1: ${withSets.player1_name} vs ${withSets.player2_name}`);

    rows = await schedule();
    const day2Match = open(rows, (entry) => entry.day_date === day2 && !String(entry.player1_name).includes(' / '))[0];
    const walkover = await addResultFromBoard(day2Match, { walkover: true });
    const walkoverMatch = ((await dashboard()).matches || []).find((match) => Number(match.id) === Number(walkover.match_id));
    if (!walkoverMatch?.winner_name) throw new Error(`Walkover saved without a winner: ${JSON.stringify(walkoverMatch)}`);
    log(`Walkover on day 2: winner ${walkoverMatch.winner_name}`);

    rows = await schedule();
    const doublesMatch = open(rows, (entry) => String(entry.player1_name).includes(' / '))[0];
    const doublesResult = await addResultFromBoard(doublesMatch, { sets: [[2, 4], [1, 4]] });
    log(`Doubles result: ${doublesResult.player1_name} vs ${doublesResult.player2_name}`);

    // header "Dodaj wynik": pick group and players by hand
    rows = await schedule();
    const manual = open(rows, (entry) => Number(entry.bracket_group_id) > 0 && !String(entry.player1_name).includes(' / '))[0];
    await page.locator('.office-topbar').getByRole('button', { name: 'Dodaj wynik' }).click();
    const headerDialog = modal();
    await headerDialog.waitFor({ state: 'visible' });
    await headerDialog.locator('label.form-control').filter({ has: page.locator('span.label-text', { hasText: /^Grupa$/ }) }).locator('select').selectOption(String(manual.bracket_group_id));
    await headerDialog.locator('label.form-control').filter({ hasText: 'Zawodnik A' }).locator('select').selectOption(manual.player1_name);
    await headerDialog.locator('label.form-control').filter({ hasText: 'Zawodnik B' }).locator('select').selectOption(manual.player2_name);
    const headerInputs = headerDialog.locator('input[type="number"]');
    await fillNumber(headerInputs.nth(0), 1);
    await fillNumber(headerInputs.nth(1), 4);
    await fillNumber(headerInputs.nth(2), 4);
    await fillNumber(headerInputs.nth(3), 2);
    await fillNumber(headerInputs.nth(4), 10);
    await fillNumber(headerInputs.nth(5), 7);
    await headerDialog.getByRole('button', { name: 'Zapisz wynik' }).click();
    await waitUntil('header result recorded', async () => ((await dashboard()).matches || []).some((match) => (
      match.player1_name === manual.player1_name && match.player2_name === manual.player2_name
    )));
    log(`Header "Dodaj wynik" with a super tie-break: ${manual.player1_name} vs ${manual.player2_name}`);

    // correction from history
    await openView('Ostatnie mecze');
    const beforeCorrection = ((await dashboard()).matches || [])[0];
    await page.getByRole('button', { name: 'Popraw wynik' }).first().click();
    const editDialog = modal();
    await editDialog.waitFor({ state: 'visible' });
    const editInputs = editDialog.locator('input[type="number"]');
    await fillNumber(editInputs.nth(0), 4);
    await fillNumber(editInputs.nth(1), 3);
    await fillNumber(editInputs.nth(2), 4);
    await fillNumber(editInputs.nth(3), 0);
    await fillNumber(editInputs.nth(4), '');
    await fillNumber(editInputs.nth(5), '');
    await editDialog.getByRole('button', { name: 'Zapisz korektę' }).click();
    const fingerprint = (match) => JSON.stringify([match?.sets, match?.score_text, match?.player1_sets, match?.player2_sets]);
    await waitUntil('correction saved', async () => {
      const match = ((await dashboard()).matches || []).find((item) => Number(item.id) === Number(beforeCorrection.id));
      return match && fingerprint(match) !== fingerprint(beforeCorrection) && fingerprint(match).includes('3');
    });
    log(`Corrected result of match ${beforeCorrection.id} from history`);

    // ——— close the B1 M group, then a knockout result ———
    await openView('Terminarz');
    const b1GroupId = ((await planning()).groups || []).find((group) => Number(group.tournament_category_id) === Number(catB1.id)).id;
    for (;;) {
      rows = await schedule();
      const next = open(rows, (entry) => Number(entry.bracket_group_id) === Number(b1GroupId))[0];
      if (!next) break;
      await addResultFromBoard(next);
    }
    const b1Progress = await waitUntil('B1 M group complete', async () => {
      const group = ((await dashboard()).progress?.groups || []).find((item) => Number(item.id) === Number(b1GroupId));
      return group?.complete ? group : null;
    });
    log(`${catB1.label} group complete (${b1Progress.finished_matches}/${b1Progress.expected_matches})`);

    await openView('Drabinka');
    const readySlot = await waitUntil('a knockout slot ready to play', async () => (
      ((await dashboard()).progress?.knockout?.matches || []).find((slotRow) => slotRow.ready && !slotRow.winner_name && slotRow.player1_name && slotRow.player2_name)
    ), { timeout: 30000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await openView('Drabinka');
    const slotCard = page.locator('section.office-view:visible article').filter({ hasText: readySlot.player1_name }).filter({ hasText: readySlot.player2_name }).first();
    await slotCard.getByRole('button', { name: 'Dodaj wynik' }).click();
    const koDialog = modal();
    await koDialog.waitFor({ state: 'visible' });
    const koInputs = koDialog.locator('input[type="number"]');
    await fillNumber(koInputs.nth(0), 4);
    await fillNumber(koInputs.nth(1), 2);
    await fillNumber(koInputs.nth(2), 4);
    await fillNumber(koInputs.nth(3), 1);
    await koDialog.getByRole('button', { name: 'Zapisz wynik' }).click();
    const koDone = await waitUntil('knockout winner recorded', async () => (
      ((await dashboard()).progress?.knockout?.matches || []).find((slotRow) => Number(slotRow.slot_id) === Number(readySlot.slot_id) && slotRow.winner_name)
    ));
    log(`Knockout "${koDone.phase}": winner ${koDone.winner_name}`);

    // ——— viewer banner: publish, edit, hide ———
    await openView('Komunikat dla widzów');
    const bannerText = `Mecze ${tag} startują o 9:00`;
    const publicInfo = () => fetch(new URL(`/api/tournament/${tournamentId}/info`, BASE_URL)).then((response) => response.json());
    await page.locator('#office-quick-info-message').fill(bannerText);
    await page.locator('#office-quick-info-active').check();
    await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await waitUntil('banner public', async () => (await publicInfo()).message === bannerText);
    const editedBanner = `${bannerText} — kort 2 opóźniony o 20 minut`;
    await page.locator('#office-quick-info-message').fill(editedBanner);
    await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await waitUntil('banner edited', async () => (await publicInfo()).message === editedBanner);
    await page.getByRole('button', { name: 'Ukryj baner' }).click();
    await waitUntil('banner hidden', async () => !(await publicInfo()).message);
    log('Viewer banner published, edited and hidden (checked on the public API)');

    // ——— rematches for one B2 K group ———
    await openView('Terminarz');
    const b2Group = ((await planning()).groups || []).find((group) => Number(group.tournament_category_id) === Number(catB2.id));
    await page.getByRole('button', { name: 'Rewanże…' }).click();
    await page.locator('label').filter({ hasText: b2Group.name }).locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Generuj rewanże' }).click();
    const rematches = await waitUntil('rematch entries', async () => {
      const found = (await schedule()).filter((entry) => entry.source_type === 'group_rematch' && Number(entry.bracket_group_id) === Number(b2Group.id));
      return found.length === 6 ? found : null;
    });
    log(`Generated ${rematches.length} rematches for ${b2Group.name}`);

    // ——— "Wyczyść dzień" on day 2 ———
    await selectDay(day2);
    const before = await schedule();
    const day2Locked = before.filter((entry) => entry.day_date === day2 && isPlaced(entry) && (entry.match_id || ['completed', 'in_progress'].includes(entry.status)));
    const day2Open = before.filter((entry) => entry.day_date === day2 && isPlaced(entry) && !entry.match_id && !['completed', 'in_progress'].includes(entry.status));
    if (!day2Open.length || !day2Locked.length) throw new Error(`Day 2 needs open and played matches (open ${day2Open.length}, played ${day2Locked.length})`);
    await page.getByRole('button', { name: 'Wyczyść dzień' }).click();
    await toast('Zdjęto z siatki');
    await waitUntil('day 2 cleared', async () => {
      const after = await schedule();
      const openLeft = after.filter((entry) => entry.day_date === day2 && isPlaced(entry) && !entry.match_id && !['completed', 'in_progress'].includes(entry.status));
      const lockedKept = day2Locked.every((kept) => {
        const row = after.find((item) => item.id === kept.id);
        return row && row.court_id === kept.court_id && row.scheduled_time === kept.scheduled_time;
      });
      return openLeft.length === 0 && lockedKept;
    });
    const drawerCount = await page.locator('[data-unassigned-entry]').count();
    if (drawerCount < day2Open.length) throw new Error(`Drawer shows ${drawerCount}, expected at least ${day2Open.length}`);
    log(`"Wyczyść dzień": ${day2Open.length} matches back in the drawer, ${day2Locked.length} played stayed`);

    // drawer category tab filters the cards
    await page.locator('.office-drawer__tab').filter({ hasText: catB2.label }).click();
    const tabCount = Number(await page.locator('.office-drawer__tab.is-active .office-drawer__count').textContent());
    const cardCount = await page.locator('[data-unassigned-entry]').count();
    if (tabCount !== cardCount) throw new Error(`Tab says ${tabCount}, drawer shows ${cardCount}`);
    log(`Drawer tab "${catB2.label}" shows its ${cardCount} matches`);

    // ——— delete everything unassigned ———
    await page.getByRole('button', { name: 'Usuń wszystkie' }).click();
    await waitUntil('no unassigned matches left', async () => (
      (await schedule()).every((entry) => isPlaced(entry) || entry.match_id || entry.status === 'completed')
    ));
    log('Deleted all unassigned matches');

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

    await page.locator('.office-rail').getByRole('button', { name: 'Wyloguj' }).click();
    await login.expectLoginScreen();
    log('Logged out');
  } catch (error) {
    await page.screenshot({ path: 'test-results/21-full-tournament-failure.png', fullPage: false }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }

  if (KEEP) {
    log(`E2E_KEEP=1 — tournament ${tournamentId} left in place`);
  } else {
    await cleanup(adminToken);
  }
}

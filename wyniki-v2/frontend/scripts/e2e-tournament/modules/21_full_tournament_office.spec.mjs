/**
 * Module 21: a whole tournament run through the office UI, every save verified through the API.
 *
 * Categories, players, pairs and the draw; generating matches; the auto-scheduler for one day
 * (with an end time) and for the whole group phase over two days; the drawer and drag and drop;
 * publishing; editing a match (time, court,
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
  fetchPublicSchedule, launchBrowser,
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
      // Transport failure only (socket closed, reset); HTTP errors are never retried.
      const cause = error?.cause ? `${error.cause.code || ''} ${error.cause.message || ''}`.trim() : String(error);
      transportErrors.push(`${init.method || 'GET'} ${path}: ${cause}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await request();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} → ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  };
  const planning = () => api('/planning');
  const dashboard = () => api('/dashboard');
  const isPlaced = (entry) => Boolean(entry.court_id && entry.scheduled_time);

  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL' });
  const page = await context.newPage();
  const pageErrors = [];
  // A thrown non-Error reaches Playwright as a bare "Object"; record what it really was.
  // Reported to the test process, so a later reload does not lose it.
  const thrown = [];
  await page.exposeFunction('__reportThrown', (entry) => { thrown.push({ step: currentStep, ...entry }); });
  await page.addInitScript(() => {
    window.__thrown = { push: (entry) => window.__reportThrown?.(entry) };
    const describe = (value) => {
      try {
        return {
          type: Object.prototype.toString.call(value),
          ctor: value?.constructor?.name,
          text: String(value?.message || value?.type || value).slice(0, 200),
          keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 10) : [],
          target: value?.target?.tagName || value?.target?.constructor?.name || '',
          stack: String(value?.stack || new Error().stack).slice(0, 600),
        };
      } catch (error) {
        return { failed: String(error) };
      }
    };
    window.addEventListener('error', (event) => window.__thrown.push({ kind: 'error', ...describe(event.error ?? event) }), true);
    window.addEventListener('unhandledrejection', (event) => window.__thrown.push({ kind: 'rejection', ...describe(event.reason) }));
  });
  let currentStep = 'start';
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(`[${currentStep}] ${error?.message || ''} ${error?.stack || ''} ${JSON.stringify(error)}`.slice(0, 900)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`[${currentStep}] ${message.text()}`.slice(0, 400)); });
  const markStep = (name) => { currentStep = name; };
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
  const dragPaths = { native: 0, synthetic: 0, syntheticSteps: [] };
  // Native pointer drag first; headless Chromium in some containers never starts an HTML5
  // drag from synthetic mouse input, so fall back to dispatching the DnD events the app
  // listens to on the same elements.
  const drag = async (source, target) => {
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    const started = await page.evaluate(() => { window.__dragSeen = false; document.addEventListener('dragstart', () => { window.__dragSeen = true; }, { once: true, capture: true }); return true; });
    if (from && to && started) {
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
      await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 40), { steps: 12 });
      await page.mouse.up();
    }
    if (await page.evaluate(() => window.__dragSeen)) {
      dragPaths.native += 1;
      return;
    }
    dragPaths.synthetic += 1;
    dragPaths.syntheticSteps.push(currentStep);
    const sourceHandle = await source.elementHandle();
    const targetHandle = await target.elementHandle();
    await page.evaluate(([src, dst]) => {
      const dataTransfer = new DataTransfer();
      const fire = (node, type) => node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
      fire(src, 'dragstart');
      fire(dst, 'dragenter');
      fire(dst, 'dragover');
      fire(dst, 'drop');
      fire(src, 'dragend');
    }, [sourceHandle, targetHandle]);
  };
  const block = (id) => page.locator(`[data-schedule-entry][data-schedule-id="${id}"]`);
  const drawerCard = (id) => page.locator(`[data-unassigned-entry][data-schedule-id="${id}"]`);

  try {
    markStep('login');
    // ——— login ———
    const login = new OfficeLoginPage(page, BASE_URL);
    await login.goto(slot);
    await login.login(OFFICE_PASSWORD);
    log('Office login through the UI');

    // office path on a fresh tournament: step 1 is the current one and the strip says where to start
    const pathState = () => page.evaluate(() => ({
      steps: [...document.querySelectorAll('.office-step')].map((node) => node.dataset.stepState),
      next: document.querySelector('[data-office-next]')?.innerText || '',
      active: Alpine.$data(document.body).activeTab,
    }));
    const fresh = await waitUntil('office path on a fresh tournament', async () => {
      const state = await pathState();
      return state.next.includes('Nie masz jeszcze grup startowych') ? state : null;
    });
    if (fresh.steps.join(',') !== 'current,later,later,later,later') throw new Error(`Fresh tournament steps: ${fresh.steps.join(',')}`);
    if (fresh.active !== 'groups') throw new Error(`Entering a fresh tournament should open Grupy startowe, opened ${fresh.active}`);
    log('Office path: fresh tournament opens Grupy startowe, step 1 current, strip "Nie masz jeszcze grup startowych"');

    markStep('categories');
    // ——— categories ———
    await openView('Grupy startowe');
    const presetBox = (label) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('input.checkbox-primary');
    // a fresh tournament has all eight B1–B4 K/M presets ticked
    const ticked = await page.locator('input.checkbox-primary:visible').evaluateAll((boxes) => boxes.filter((box) => box.checked).length);
    if (ticked !== 8) throw new Error(`Expected the 8 standard categories ticked by default, found ${ticked}`);
    for (const box of await page.locator('input.checkbox-primary:visible').all()) await box.uncheck();
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

    markStep('two more players through the office form');
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
    await waitUntil('20 players', async () => ((await planning()).players || []).length === 20);
    log('Added 2 players through the office form (20 total)');

    markStep('draw: B2 K into two groups, B1 M into one');
    // ——— draw: B2 K into two groups, B1 M into one ———
    const divisionCard = (label) => page.locator('.office-groups button.rounded-2xl').filter({ hasText: label }).first();
    await divisionCard(catB2.label).click();
    await page.locator('.office-groups button').filter({ hasText: /^\+$/ }).click();
    // an empty second group is not saved; a refresh must not take the count back to 1
    await page.locator('.office-topbar').getByRole('button', { name: 'Odśwież' }).click();
    await page.waitForTimeout(2500);
    const groupCount = await page.evaluate(() => Alpine.$data(document.body).planningGroupCount);
    if (Number(groupCount) !== 2) throw new Error(`Group count went back to ${groupCount} after a refresh`);
    // start numbers are the players' own: the draw must not renumber them
    const shownNumbers = () => page.locator('.office-groups [data-start-number]:visible').evaluateAll((nodes) => Object.fromEntries(
      nodes.map((node) => [node.parentElement.querySelector('.truncate')?.textContent.trim(), node.textContent.trim()]),
    ));
    const numbersBeforeDraw = await waitUntil('start numbers in B2 K', async () => {
      const shown = await shownNumbers();
      return Object.keys(shown).length && Object.values(shown).every(Boolean) ? shown : null;
    });
    const planned = await planning();
    const categoryNumbers = planned.start_numbers?.[String(catB2.id)]?.player || {};
    const storedNumbers = Object.fromEntries((planned.players || []).map((player) => [player.name, String(categoryNumbers[String(player.id)] || '')]));
    const sortedShown = Object.values(numbersBeforeDraw).map(Number).sort((a, b) => a - b).join(',');
    if (sortedShown !== Array.from({ length: Object.keys(numbersBeforeDraw).length }, (_, index) => index + 1).join(',')) {
      throw new Error(`B2 K should be numbered 1…n inside the category, shown ${sortedShown}`);
    }
    const numberMismatch = Object.entries(numbersBeforeDraw).filter(([name, number]) => storedNumbers[name] !== number);
    if (!Object.keys(numbersBeforeDraw).length || numberMismatch.length) throw new Error(`Start numbers before the draw: ${JSON.stringify(numberMismatch)}`);
    await page.getByRole('button', { name: 'Rozdziel automatycznie' }).click();
    await waitUntil('B2 K in two groups of four', async () => {
      const groups = ((await planning()).groups || []).filter((group) => Number(group.tournament_category_id) === Number(catB2.id));
      return groups.length === 2 && groups.every((group) => group.players.length === 4);
    });
    const numbersAfterDraw = await waitUntil('drawn players shown in groups', async () => {
      const shown = await shownNumbers();
      return Object.keys(numbersBeforeDraw).every((name) => shown[name]) ? shown : null;
    });
    const renumbered = Object.entries(numbersBeforeDraw).filter(([name, number]) => numbersAfterDraw[name] !== number);
    if (renumbered.length) throw new Error(`The draw renumbered players: ${JSON.stringify(renumbered.map(([name, number]) => [name, number, numbersAfterDraw[name]]))}`);
    log(`${catB2.label} start numbers ${Object.values(numbersBeforeDraw).join(', ')} (numbered inside the category) kept after the draw into groups`);
    log(`${catB2.label}: two groups of four`);

    await divisionCard(catB1.label).click();
    await page.getByRole('button', { name: 'Przypisz wszystkich' }).click();
    await waitUntil('B1 M in one group of four', async () => {
      const groups = ((await planning()).groups || []).filter((group) => Number(group.tournament_category_id) === Number(catB1.id));
      return groups.length === 1 && groups[0].players.length === 4;
    });
    log(`${catB1.label}: one group of four`);

    markStep('doubles: four pairs through the form, then the draw');
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

    const drawn = await waitUntil('step 1 done after the draw', async () => {
      const state = await pathState();
      return state.steps[0] === 'done' && state.next.includes('Wybierz formę rozgrywek każdej kategorii') ? state : null;
    }, { timeout: 15000 }).catch(async (error) => {
      throw new Error(`${error.message}: ${JSON.stringify(await pathState())}`);
    });
    if (drawn.steps[1] !== 'current') throw new Error(`After the draw step 2 (Drabinki) should be current: ${drawn.steps.join(',')}`);
    await page.locator('[data-office-next]').getByRole('button', { name: 'Wybierz formę rozgrywek' }).click();
    await page.waitForFunction(() => Alpine.$data(document.body).activeTab === 'draws');
    const drawCategories = page.locator('[data-draw-category]');
    await waitUntil('three categories in Drabinki', async () => (await drawCategories.count()) === 3);
    const defaults = await drawCategories.evaluateAll((nodes) => nodes.map((node) => node.querySelector('[data-draw-state]')?.dataset.drawState));
    if (defaults.some((state) => state === 'confirmed')) throw new Error(`Nothing is confirmed before the office looks: ${defaults.join(',')}`);
    // confirming one category marks its card at once; the others still wait
    await drawCategories.nth(1).click();
    await page.locator('[data-draw-confirm]').click();
    const oneConfirmed = await waitUntil('one card marked confirmed', async () => {
      const states = await page.locator('[data-draw-state]').evaluateAll((nodes) => nodes.map((node) => node.dataset.drawState));
      const tally = await page.locator('[data-draw-tally]').innerText();
      return states.filter((state) => state === 'confirmed').length === 1 && tally.includes('1 z 3') ? states : null;
    }).catch(async (error) => {
      throw new Error(`${error.message}: ${JSON.stringify(await page.locator('[data-draw-state]').evaluateAll((nodes) => nodes.map((node) => node.dataset.drawState)))}`);
    });
    if ((await page.locator('.office-draws__cat.is-confirmed .office-draws__cat-icon').innerText()).trim() !== '✓') throw new Error('A confirmed card needs its ✓');
    log(`Drabinki: confirming one category marks its card ✓ at once (${oneConfirmed.join(', ')}; "Zatwierdzone: 1 z 3")`);
    await page.locator('[data-office-next]').getByRole('button', { name: 'Zatwierdź wszystkie' }).click();
    await toast('Wszystkie drabinki zatwierdzone');
    const drawsConfirmed = await waitUntil('step 2 done after confirming the draws', async () => {
      const state = await pathState();
      return state.steps[1] === 'done' && state.steps[2] === 'current' && state.next.includes('Wszystkie grupy gotowe') ? state : null;
    }, { timeout: 15000 }).catch(async (error) => {
      throw new Error(`${error.message}: ${JSON.stringify(await pathState())}`);
    });
    await page.locator('[data-office-next]').getByRole('button', { name: 'Przejdź do terminarza' }).click();
    await page.waitForFunction(() => Alpine.$data(document.body).activeTab === 'planning');
    log(`Office path: all groups drawn → step 1 done, step 2 Drabinki current; "Zatwierdź wszystkie" → ${drawsConfirmed.steps.join(',')}, "Przejdź do terminarza" opens Terminarz`);

    markStep('matches');
    // ——— matches ———
    await openView('Terminarz');
    await page.getByRole('button', { name: 'Generuj mecze' }).click();
    const groupEntries = await waitUntil('24 group matches', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
      return rows.length === 24 ? rows : null;
    });
    log(`Generated ${groupEntries.length} group matches`);

    // nothing placed yet: the empty board already covers the whole day, to its end hour
    await page.locator('.office-daybar input[type="time"]').nth(0).fill('09:00');
    await page.locator('.office-daybar input[type="time"]').nth(1).fill('21:00');
    const emptyBoard = await waitUntil('empty board 09:00–21:00', async () => {
      const state = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('[data-cell]')].map((node) => node.getAttribute('data-cell').split('|')[1]);
        return { first: cells[0], last: cells[cells.length - 1], blocks: document.querySelectorAll('[data-schedule-entry][data-minutes]').length };
      });
      return state.first === '09:00' && state.last === '20:45' ? state : null;
    }).catch(async (error) => {
      throw new Error(`${error.message}: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-cell]')].slice(-1).map((node) => node.getAttribute('data-cell'))))}`);
    });
    await waitUntil('day hours saved', async () => {
      const config = (await api('/autoschedule/config')).config || {};
      return config.start_time === '09:00' && config.end_time === '21:00';
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await openView('Terminarz');
    await waitUntil('board still to 21:00 after a reload', async () => page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-cell]')];
      return cells.length > 0 && cells[cells.length - 1].getAttribute('data-cell').endsWith('|20:45');
    }));
    log(`Empty board (${emptyBoard.blocks} matches placed) runs 09:00–21:00; the hours are saved and survive a reload`);

    markStep('day 1 plan with the auto-scheduler');
    // ——— day 1 plan with the auto-scheduler ———
    const endsAfter = (end) => (entry) => {
      const [h, m] = String(entry.scheduled_time).split(':').map(Number);
      const minutes = String(entry.category_name || '').startsWith('B1') ? 75 : 60;
      const [eh, em] = end.split(':').map(Number);
      return h * 60 + m + minutes > eh * 60 + em;
    };
    await selectDay(day1);
    await page.locator('.office-toolbar select').selectOption('group');
    await page.locator('.office-daybar input[type="time"]').nth(0).fill('09:00');
    await page.locator('.office-daybar input[type="time"]').nth(1).fill('13:00');
    await page.getByRole('button', { name: 'Rozstaw ten dzień' }).click();
    // a block of the proposal opens the inspector; moving it there moves it on the board
    const proposed = page.locator('[data-schedule-entry][data-minutes]').first();
    await proposed.waitFor({ state: 'visible', timeout: 15000 });
    const proposedId = await proposed.getAttribute('data-schedule-id');
    await proposed.click();
    const previewInspector = page.locator('.office-inspector');
    await previewInspector.locator('.office-inspector__preview').waitFor({ state: 'visible', timeout: 5000 });
    const proposedTime = await previewInspector.locator('input[type="time"]').inputValue();
    if (!/^[0-9]{2}:[0-9]{2}$/.test(proposedTime)) throw new Error(`Proposal inspector shows no time: "${proposedTime}"`);
    if (await previewInspector.getByRole('button', { name: 'Zapisz', exact: true }).isVisible()) throw new Error('Saving a single match must wait for the approved proposal');
    await proposed.click();
    log(`Proposal block ${proposedId} at ${proposedTime} opens the inspector (hint shown, saving hidden until approval)`);
    await page.getByRole('button', { name: 'Zatwierdź terminarz' }).click();
    const day1Placed = await waitUntil('day 1 placements', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.day_date === day1 && isPlaced(entry));
      return rows.length ? rows : null;
    });
    const lateOnDay1 = day1Placed.filter(endsAfter('13:00'));
    if (lateOnDay1.length) throw new Error(`Day plan ignored the 13:00 end: ${lateOnDay1.map((entry) => `${entry.category_name} ${entry.scheduled_time}`).join(', ')}`);
    const overflow = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group' && !isPlaced(entry));
    if (!overflow.length) throw new Error('Expected matches that do not fit 09:00–13:00 to stay unassigned');
    if (overflow.length + day1Placed.length !== 24) throw new Error(`Placed ${day1Placed.length} + unassigned ${overflow.length} != 24`);
    log(`"Rozstaw ten dzień" 09:00–13:00: ${day1Placed.length} on the board, ${overflow.length} left in the drawer`);

    // take matches off day 1 into the drawer (drag onto the drawer)
    await page.waitForSelector('[data-schedule-entry]');
    await page.evaluate(() => {
      window.__dnd = [];
      for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) {
        document.addEventListener(type, (event) => {
          const node = event.target instanceof Element ? event.target : event.target?.parentElement;
          const where = node?.closest('[data-schedule-id],[data-cell],.office-drawer')?.className?.toString().split(' ')[0] || node?.tagName;
          const last = window.__dnd[window.__dnd.length - 1];
          if (last && last[0] === type && last[1] === where) return;
          window.__dnd.push([type, where, Alpine.$data(document.body).autoDragId]);
        }, true);
      }
    });
    const toMove = day1Placed.slice(-3);
    for (const entry of toMove) {
      await block(entry.id).scrollIntoViewIfNeeded();
      await drag(block(entry.id), page.locator('.office-drawer'));
      await waitUntil(`entry ${entry.id} in the drawer`, async () => {
        const row = ((await planning()).schedule || []).find((item) => item.id === entry.id);
        return row && !isPlaced(row);
      });
    }
    await drawerCard(toMove[0].id).waitFor({ state: 'visible' });
    log(`Dragged ${toMove.length} matches from the day 1 board into the drawer`);

    markStep('day 2 plan: drag the six drawer cards onto the day 2 board');
    // ——— day 2 by hand: drag drawer cards onto the day 2 board ———
    await selectDay(day2);
    const courtIds = (await api('/autoschedule/config')).courts.map((court) => String(court.kort_id));
    for (const [index, entry] of toMove.entries()) {
      const court = courtIds[index % courtIds.length];
      const cellId = await page.evaluate((wanted) => {
        const cells = [...document.querySelectorAll('[data-cell]')].filter((node) => node.getAttribute('data-cell').startsWith(`${wanted}|`));
        const empty = cells.find((node) => !node.hasAttribute('data-occupied'));
        return (empty || cells[0])?.getAttribute('data-cell') || null;
      }, court);
      if (!cellId) throw new Error(`No cell for court ${court} on day 2`);
      const cell = page.locator(`[data-cell="${cellId}"]`);
      await cell.scrollIntoViewIfNeeded();
      await drag(drawerCard(entry.id), cell);
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
      [...document.querySelectorAll('[data-cell]')].find((node) => node.getAttribute('data-cell').startsWith(`${wanted}|`) && !node.hasAttribute('data-occupied'))
      || [...document.querySelectorAll('[data-cell]')].find((node) => node.getAttribute('data-cell').startsWith(`${wanted}|`))
    )?.getAttribute('data-cell'), otherCourt);
    await block(mover.id).scrollIntoViewIfNeeded();
    await drag(block(mover.id), page.locator(`[data-cell="${moverCell}"]`));
    await waitUntil(`match ${mover.id} on court ${otherCourt}`, async () => {
      const row = ((await planning()).schedule || []).find((item) => item.id === mover.id);
      return row && String(row.court_id) === otherCourt && row.day_date === day2;
    });
    log(`Board drag: match ${mover.id} moved from court ${mover.court_id} to court ${otherCourt}`);

    // ——— whole group phase over both days ———
    await page.getByRole('button', { name: 'Rozstaw fazę grupową' }).click();
    // the proposal spans both days: each day can be looked at before approving, nothing is dropped
    await waitUntil('proposal day tabs with counts', async () => (await page.locator('.office-daytab__count:visible').count()) === 2);
    await selectDay(day2);
    await page.locator('.office-preview-bar').waitFor({ state: 'visible', timeout: 5000 });
    const day2Proposal = await waitUntil('day 2 of the proposal on the board', async () => {
      const count = await page.locator('[data-schedule-entry][data-minutes]').count();
      return count > 0 ? count : null;
    });
    await selectDay(day1);
    if (!(await page.locator('.office-preview-bar').isVisible())) throw new Error('Switching days dropped the proposal');
    log(`Whole-phase proposal: switched to day 2 (${day2Proposal} matches) and back without losing it`);
    await page.getByRole('button', { name: 'Zatwierdź terminarz' }).click();
    const spread = await waitUntil('group phase spread over both days', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
      const placed = rows.filter(isPlaced);
      const days = new Set(placed.map((entry) => entry.day_date));
      return placed.length === 24 && days.has(day1) && days.has(day2) ? placed : null;
    });
    const afterEnd = spread.filter(endsAfter('13:00'));
    if (afterEnd.length) throw new Error(`Phase plan ignored the 13:00 end: ${afterEnd.length} matches`);
    log(`"Rozstaw fazę grupową": all 24 placed, ${spread.filter((entry) => entry.day_date === day1).length} on day 1 and ${spread.filter((entry) => entry.day_date === day2).length} on day 2, all finished by 13:00`);

    markStep('board drawn to scale');
    // the board runs from the day's start to its end hour, and a match is as tall as it lasts
    await page.locator('.office-daybar input[type="time"]').nth(1).fill('21:00');
    const board = await waitUntil('board to 21:00', async () => {
      const state = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('[data-cell]')].map((node) => node.getAttribute('data-cell').split('|')[1]);
        const tick = parseFloat(getComputedStyle(document.querySelector('.office-timetable')).getPropertyValue('--kort-tick')) || 0;
        const blocks = [...document.querySelectorAll('[data-schedule-entry][data-minutes]')].map((node) => ({ minutes: Number(node.dataset.minutes), height: node.offsetHeight }));
        const drawer = document.querySelector('.office-drawer')?.getBoundingClientRect();
        return { first: cells[0], last: cells[cells.length - 1], tick, blocks, drawerBottom: drawer?.bottom, viewport: window.innerHeight };
      });
      return state.last === '20:45' ? state : null;
    });
    if (board.first !== '09:00') throw new Error(`Board should start at 09:00, starts at ${board.first}`);
    const perMinute = board.blocks.map((item) => (item.height + 4) / item.minutes);
    const minutesSeen = [...new Set(board.blocks.map((item) => item.minutes))].sort((a, b) => a - b);
    if (minutesSeen.length < 2) throw new Error(`Expected matches of different lengths on the board, saw ${minutesSeen.join(',')}`);
    if (Math.max(...perMinute) - Math.min(...perMinute) > 0.05) throw new Error(`Block heights are not proportional to minutes: ${JSON.stringify(board.blocks.slice(0, 6))}`);
    if (Math.abs(perMinute[0] - board.tick / 15) > 0.05) throw new Error(`A 15-minute row should be ${board.tick}px, blocks give ${perMinute[0] * 15}px`);
    await page.locator('.office-views').evaluate((node) => { node.scrollTop = 0; });
    const drawerBox = await page.locator('.office-drawer').boundingBox();
    if (!drawerBox || drawerBox.y + drawerBox.height > board.viewport + 1 || drawerBox.y > board.viewport) throw new Error(`The unassigned drawer should stay at the bottom of the screen: ${JSON.stringify(drawerBox)}`);
    await page.screenshot({ path: 'test-results/office-board-scale.png' });
    log(`Board 09:00–21:00 in 15-minute rows of ${board.tick}px; ${minutesSeen.join(' and ')}-minute matches proportional; drawer stays at the bottom`);
    await page.locator('.office-daybar input[type="time"]').nth(1).fill('13:00');

    markStep('publish');
    const day2PlacedNow = ((await planning()).schedule || []).filter((entry) => entry.day_date === day2 && isPlaced(entry));
    if (!day2PlacedNow.length) throw new Error('No matches on day 2 after planning the phase');

    // ——— publish ———
    await page.getByRole('button', { name: 'Opublikuj wszystkie' }).click();
    await page.locator('[data-publish-confirm]').click();
    await waitUntil('placed matches published', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group' && isPlaced(entry));
      return rows.length && rows.every((entry) => entry.status === 'planned');
    });
    const publicSchedule = await fetchPublicSchedule(tournamentId);
    const publicDays = (publicSchedule.days || []).map((day) => ({
      date: day.date,
      matches: (day.categories || []).flatMap((category) => category.matches || []),
    }));
    const publicCount = publicDays.reduce((sum, day) => sum + day.matches.length, 0);
    if (!publicDays.some((day) => day.date === day1 && day.matches.length) || !publicDays.some((day) => day.date === day2 && day.matches.length)) {
      throw new Error(`Public schedule should list both days: ${JSON.stringify(publicDays.map((day) => [day.date, day.matches.length]))}`);
    }
    log(`Published; public schedule lists ${publicCount} matches on ${publicDays.map((day) => day.date).join(', ')}`);

    markStep('inspector: time, court and public note');
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
    await selectDay(day1);
    const remark = page.locator(`[data-schedule-entry][data-schedule-id="${edited.id}"] .office-block__remark`);
    await remark.waitFor({ state: 'visible', timeout: 10000 });
    if (!(await remark.innerText()).includes(note)) throw new Error(`Match card should show its notes: ${await remark.innerText()}`);
    log('Match card shows "Uwagi: …" once notes are typed');

    markStep('notes for many matches');
    // one note for every unplayed match on a court on day 1, previewed, then cleared again
    await selectDay(day1);
    await page.locator('[data-open-schedule-notes]').click();
    await page.waitForFunction(() => Alpine.$data(document.body).activeTab === 'quickinfo');
    const notesPanel = page.locator('[data-schedule-notes]');
    await notesPanel.waitFor({ state: 'visible' });
    if ((await notesPanel.locator('[data-notes-day]').inputValue()) !== day1) throw new Error('"Uwagi do meczów" should open with the day from the board');
    const notesCourt = String(((await planning()).schedule || []).find((entry) => entry.day_date === day1 && isPlaced(entry) && !entry.match_id)?.court_id || '');
    await notesPanel.locator(`[data-notes-court="${notesCourt}"]`).click();
    const bulkNote = `Kort kryty ${tag}`;
    await notesPanel.locator('[data-notes-text]').fill(bulkNote);
    const expected = ((await planning()).schedule || []).filter((entry) => entry.day_date === day1 && String(entry.court_id) === notesCourt && !entry.match_id && !['completed', 'in_progress'].includes(String(entry.status)));
    await waitUntil('notes preview count', async () => (await notesPanel.locator('[data-notes-summary]').innerText()).includes(String(expected.length)));
    await notesPanel.locator('[data-notes-apply]').click();
    await toast('Zapisano uwagi');
    await waitUntil('bulk note saved on the court', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => expected.some((item) => item.id === entry.id));
      return rows.length === expected.length && rows.every((entry) => entry.notes_public === bulkNote);
    });
    const untouched = ((await planning()).schedule || []).filter((entry) => String(entry.court_id) !== notesCourt && entry.notes_public === bulkNote);
    if (untouched.length) throw new Error(`The note reached matches on other courts: ${untouched.map((entry) => entry.id).join(', ')}`);
    await notesPanel.locator('[data-notes-mode="clear"]').click();
    await waitUntil('clear preview', async () => (await notesPanel.locator('[data-notes-apply]').textContent()).includes('Wyczyść')).catch(async (error) => {
      throw new Error(`${error.message}: ${JSON.stringify(await page.evaluate(() => ({ form: Alpine.$data(document.body).scheduleNotesForm, active: Alpine.$data(document.body).activeTab, button: document.querySelector('[data-notes-apply]')?.outerHTML?.slice(0, 400) })))}`);
    });
    await notesPanel.locator('[data-notes-apply]').click();
    await waitUntil('bulk note cleared', async () => ((await planning()).schedule || []).filter((entry) => expected.some((item) => item.id === entry.id)).every((entry) => !entry.notes_public));
    await notesPanel.locator('[data-notes-mode="replace"]').click();
    await notesPanel.locator(`[data-notes-court="${notesCourt}"]`).click();
    await openView('Terminarz');
    log(`Notes for many matches: "${bulkNote}" on ${expected.length} unplayed matches of court ${notesCourt} on ${day1} (preview count matched), other courts untouched, then cleared`);

    markStep('results');
    // ——— results ———
    const addResultFromBoard = async (entry, { sets = [[4, 1], [4, 2]], walkover = false } = {}) => {
      await selectDay(entry.day_date);
      if (!(await block(entry.id).count())) {
        await page.waitForTimeout(1500);
      }
      if (!(await block(entry.id).count())) {
        const rows = ((await planning()).schedule || []).filter((row) => row.day_date === entry.day_date && String(row.court_id) === String(entry.court_id));
        const ui = await page.evaluate(([id, court]) => {
          const data = Alpine.$data(document.body);
          const row = (data.planningSchedule || []).find((item) => item.id === id);
          return { day: data.autoDayDate, row, board: (data.autoBoardEntries(court) || []).map((item) => [item.id, item.scheduled_time]) };
        }, [entry.id, String(entry.court_id)]).catch((error) => String(error));
        throw new Error(`Match ${entry.id} (${entry.day_date} ${entry.scheduled_time} court ${entry.court_id}) is not on the board. Same court that day: ${JSON.stringify(rows.map((row) => [row.id, row.scheduled_time, row.status, row.match_id]))}; UI: ${JSON.stringify(ui)}`);
      }
      await block(entry.id).scrollIntoViewIfNeeded();
      await block(entry.id).click();
      await inspector.getByRole('button', { name: 'Dodaj wynik' }).click();
      const dialog = modal();
      await dialog.waitFor({ state: 'visible' });
      if (walkover) {
        await dialog.locator('input.toggle-success').check();
        const winnerSelect = dialog.locator('label.form-control:visible').filter({ hasText: 'Zwycięzca walkowerem' }).locator('select');
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
    // a singles match on day 2 when the phase plan put one there, otherwise any other open singles match
    const singlesOpen = (entry) => !String(entry.player1_name).includes(' / ');
    const day2Match = open(rows, (entry) => entry.day_date === day2 && singlesOpen(entry))[0]
      || open(rows, (entry) => singlesOpen(entry) && entry.id !== singlesDay1.id)[0];
    const walkover = await addResultFromBoard(day2Match, { walkover: true });
    const walkoverMatch = ((await dashboard()).matches || []).find((match) => Number(match.id) === Number(walkover.match_id));
    if (!walkoverMatch?.winner_name) throw new Error(`Walkover saved without a winner: ${JSON.stringify(walkoverMatch)}`);
    log(`Walkover on ${ddmm(day2Match.day_date)}: winner ${walkoverMatch.winner_name}`);

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
    await headerDialog.locator('label.form-control:visible').filter({ has: page.locator('span.label-text', { hasText: /^Grupa$/ }) }).locator('select').selectOption(String(manual.bracket_group_id));
    await headerDialog.locator('label.form-control:visible').filter({ hasText: 'Zawodnik A' }).locator('select').selectOption(manual.player1_name);
    await headerDialog.locator('label.form-control:visible').filter({ hasText: 'Zawodnik B' }).locator('select').selectOption(manual.player2_name);
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

    markStep('close the B1 M group, then a knockout result');
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

    await openView('Faza pucharowa');
    const readySlot = await waitUntil('a knockout slot ready to play', async () => (
      ((await dashboard()).progress?.knockout?.matches || []).find((slotRow) => slotRow.ready && !slotRow.winner_name && slotRow.player1_name && slotRow.player2_name)
    ), { timeout: 30000 }).catch(async (error) => {
      const slots = ((await dashboard()).progress?.knockout?.matches || []).map((row) => [row.phase, row.player1_name, row.player2_name, row.ready, row.winner_name]);
      throw new Error(`${error.message}: ${JSON.stringify(slots)}`);
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await openView('Faza pucharowa');
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

    markStep('viewer banner: publish, edit, hide');
    // ——— viewer banner: publish, edit, hide ———
    await openView('Komunikat dla zawodników');
    const bannerText = `Mecze ${tag} startują o 9:00`;
    const publicInfo = () => fetch(new URL(`/api/tournament/${tournamentId}/info`, BASE_URL)).then((response) => response.json());
    await page.locator('#office-quick-info-message').fill(bannerText);
    await page.locator('#office-quick-info-active').check();
    await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await waitUntil('banner public', async () => (await publicInfo()).message === bannerText);
    const editedBanner = `${bannerText} — kort 2 opóźniony o 20 minut`;
    await page.locator('#office-quick-info-message').fill(editedBanner);
    await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await waitUntil('banner edited', async () => (await publicInfo()).message === editedBanner).catch(async (error) => {
      const ui = await page.evaluate(() => {
        const data = Alpine.$data(document.body);
        return { message: data.quickInfoMessage, dirty: data.quickInfoDirty, saving: data.quickInfoSaving };
      }).catch((e) => String(e));
      const toasts = await page.locator('.toast .alert').allInnerTexts().catch(() => []);
      throw new Error(`${error.message}; public ${JSON.stringify(await publicInfo())}; UI ${JSON.stringify(ui)}; toasts ${toasts.join(' | ')}`);
    });
    await page.getByRole('button', { name: 'Ukryj baner' }).click();
    await waitUntil('banner hidden', async () => !(await publicInfo()).message);
    log('Viewer banner published, edited and hidden (checked on the public API)');

    markStep('rematches for one B2 K group');
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

    markStep('"Wyczyść dzień" on day 2');
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

    markStep('delete everything unassigned');
    // ——— delete everything unassigned, then bring the fixtures back with "Generuj mecze" ———
    const openUnplaced = (rows) => rows.filter((entry) => !isPlaced(entry) && !entry.match_id && entry.status !== 'completed');
    const unplacedBefore = openUnplaced(await schedule());
    await page.getByRole('button', { name: 'Usuń wszystkie' }).click();
    await toast('Usunięto');
    await waitUntil('drawer empty', async () => openUnplaced(await schedule()).length === 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await openView('Terminarz');
    await page.waitForTimeout(1500);
    const afterReload = openUnplaced(await schedule());
    if (afterReload.length) throw new Error(`${afterReload.length} deleted matches came back after a reload`);
    if (await page.locator('[data-unassigned-entry]').count()) throw new Error('Drawer is not empty after deleting everything');
    log(`"Usuń wszystkie": ${unplacedBefore.length} deleted (manual, rematches and generated) and still gone after a reload`);

    await page.getByRole('button', { name: 'Generuj mecze' }).click();
    const regenerated = await waitUntil('fixtures regenerated', async () => {
      const rows = openUnplaced(await schedule()).filter((entry) => entry.source_type !== 'group_rematch');
      return rows.length ? rows : null;
    });
    await page.locator('[data-unassigned-entry]').first().waitFor({ state: 'visible', timeout: 10000 });
    log(`"Generuj mecze" brought back ${regenerated.length} generated fixtures into the drawer`);

    log(`Drag and drop: ${dragPaths.native} native pointer drags, ${dragPaths.synthetic} dispatched DnD events${dragPaths.synthetic ? ` (${dragPaths.syntheticSteps.join(', ')})` : ''}`);
    if (consoleErrors.length) log(`Console errors: ${consoleErrors.join(' | ')}`);
    if (transportErrors.length) log(`Retried after transport errors: ${transportErrors.join(' | ')}`);
    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

    await page.locator('.office-rail').getByRole('button', { name: 'Wyloguj' }).click();
    await login.expectLoginScreen();
    log('Logged out');
  } catch (error) {
    await page.screenshot({ path: 'test-results/21-full-tournament-failure.png', fullPage: false }).catch(() => {});
    const state = await planning().catch(() => ({}));
    const ui = await page.evaluate(() => ({
      active: document.querySelector('.office-tab.is-active')?.textContent?.trim(),
      toasts: [...document.querySelectorAll('.toast .alert')].filter((node) => node.offsetParent).map((node) => node.textContent.trim()),
      alpine: (() => {
        const d = window.Alpine?.$data(document.body);
        return d ? {
          division: d.planningSelectedDivision, categoryId: d.planningSelectedCategoryId, groupCount: d.planningGroupCount,
          targets: d.planningTargetGroupNames?.(), unassigned: d.planningUnassignedPlayers?.().length,
          assignments: Object.keys(d.planningGroupAssignments || {}).length, saving: d.planningSaving,
        } : null;
      })(),
      groupsText: document.querySelector('.office-groups')?.innerText.replace(/\s+/g, ' ').slice(0, 900),
    })).catch((uiError) => ({ uiError: String(uiError) }));
    console.log(`  DIAG groups=${JSON.stringify((state.groups || []).map((group) => [group.name, group.tournament_category_id, group.players.length]))}`);
    console.log(`  DIAG players=${JSON.stringify((state.players || []).map((player) => `${player.category}${player.gender}`))}`);
    console.log(`  DIAG ui=${JSON.stringify(ui)}`);
    if (pageErrors.length) {
      console.log(`  DIAG pageErrors=${JSON.stringify(pageErrors)}`);
      console.log(`  DIAG thrown=${JSON.stringify(thrown)}`);
    }
    if (transportErrors.length) console.log(`  DIAG transport=${JSON.stringify(transportErrors)}`);
    console.log(`  DIAG error=${error?.message} cause=${error?.cause ? `${error.cause.code || ''} ${error.cause.message || ''}` : ''}`);
    const dnd = await page.evaluate(() => window.__dnd || []).catch(() => []);
    if (dnd.length) console.log(`  DIAG dnd=${JSON.stringify(dnd.slice(-30))}`);
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

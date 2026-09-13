/**
 * Module 24: translation audit of the public site and the office in every language.
 *
 * Seeds a tournament that shows the newer screens (four groups of three with a finished group
 * stage, so the Vilnius draw with "Zwycięzca: …", places and consolation exists; a doubles
 * straight knockout; a viewer banner), then opens every public section and every office view
 * and dialog in pl, de, en, it, es, fr and lt. Collects the visible text, placeholders,
 * aria-labels, titles and select options and reports:
 * - raw translation keys ("planning.doubles", "modals.teamA")
 * - Polish words or letters (ą ć ę ł ń ś ź ż) on a page in another language
 * Test data uses ASCII names so everything flagged comes from the interface.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, confirmCategories, saveGroups, cleanup, createTeam,
  resolveOfficeSlot, officeLogin, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const KEEP = process.env.E2E_KEEP === '1';
const LANGS = ['pl', 'de', 'en', 'it', 'es', 'fr', 'lt'];
const log = (message) => console.log(`  ${message}`);

const POLISH_LETTERS = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/;
const POLISH_ONLY_LETTERS = /[ćłńśźżĆŁŃŚŹŻ]/; // Lithuanian also has ą and ę
const POLISH_WORDS = [
  'Wszystkie', 'Wszyscy', 'Grupa', 'Grupy', 'Kobiety', 'Mężczyźni', 'Zwycięzca', 'Przegrany', 'miejsce', 'miejsca',
  'Pocieszenie', 'Ćwierćfinał', 'Półfinał', 'Finał', 'Terminarz', 'Drabinka', 'Wynik', 'Wyniki', 'Debel', 'Zawodnik',
  'Zawodnicy', 'Dodaj', 'Zapisz', 'Usuń', 'Anuluj', 'Opublikuj', 'Brak', 'Mecz', 'Mecze', 'meczów', 'Kategoria', 'Dzień',
  'Zamknij', 'Wyczyść', 'Odśwież', 'Wyloguj', 'Biuro', 'Pary', 'Rozstaw', 'Rewanże', 'Postęp', 'Pozostało', 'Zakończone',
  'Komunikat', 'Grupowa', 'Pucharowa', 'Kort', 'oraz', 'lub', 'dla', 'się', 'jest', 'nie', 'Turniej', 'Zamień', 'Tutaj',
];
const WORD_PATTERN = new RegExp(`(^|[^\\p{L}])(${POLISH_WORDS.join('|')})(?=$|[^\\p{L}])`, 'u');
const KEY_PATTERN = /\b(?:planning|modals|toast|errors|login|hero|stats|tabs|bracket|knockout|history|quickInfo|status|phases|confirm|gender|categories|scope|playerSection|schedule|ui)\.[a-zA-Z][a-zA-Z0-9]*\b/;

async function waitUntil(label, probe, { timeout = 20000, interval = 400 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

/** Visible strings of the page: text lines plus placeholders, labels, titles and options. */
async function pageStrings(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    };
    const strings = document.body.innerText.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const node of document.querySelectorAll('[placeholder], [aria-label], [title]')) {
      if (!visible(node)) continue;
      for (const attribute of ['placeholder', 'aria-label', 'title']) {
        const value = node.getAttribute(attribute);
        if (value) strings.push(value.trim());
      }
    }
    for (const select of document.querySelectorAll('select')) {
      if (!visible(select)) continue;
      for (const option of select.options) strings.push(option.textContent.trim());
    }
    return [...new Set(strings)].filter(Boolean);
  });
}

export default async function run() {
  const adminToken = await adminLogin();
  const today = new Date().toISOString().slice(0, 10);
  const tournament = await createTournament(adminToken, { startDate: today, endDate: today, courts: 4, isSimulation: false, isPublic: true });
  const tournamentId = tournament.id;
  const tag = tournament.name.split(' ')[0];
  const dataStrings = new Set([tournament.name, tag]);

  const confirmed = await confirmCategories(adminToken, tournamentId, [
    { preset_key: 'B2K' },
    { preset_key: 'B1M', is_doubles: true },
  ]);
  const b2 = confirmed.categories.find((cat) => !cat.is_doubles);
  const doubles = confirmed.categories.find((cat) => cat.is_doubles);
  const names = [];
  for (const letter of 'ABCD') for (let rank = 1; rank <= 3; rank += 1) names.push(`W${letter}${rank}`);
  const women = names.map((first) => ({ name: `${first} ${tag}`, first_name: first, last_name: tag, category: 'B2', gender: 'K', country: 'GB' }));
  const men = ['Amos', 'Bram', 'Cole', 'Dean', 'Emil', 'Finn'].map((first) => ({ name: `${first} ${tag}`, first_name: first, last_name: tag, category: 'B1', gender: 'M', country: 'GB' }));
  const created = await addPlayers(adminToken, tournamentId, [...women, ...men]);
  const idOf = Object.fromEntries([...women, ...men].map((player, index) => [player.first_name, created.players[index].id]));
  const teams = [];
  for (let i = 0; i < 3; i += 1) teams.push(await createTeam(adminToken, tournamentId, doubles.id, idOf[men[i * 2].first_name], idOf[men[i * 2 + 1].first_name]));
  await saveGroups(adminToken, tournamentId, [
    ...'ABCD'.split('').map((letter) => ({
      name: `${b2.label} — Grupa ${letter}`,
      tournament_category_id: b2.id,
      play_format: 'groups_knockout',
      players: [1, 2, 3].map((rank) => idOf[`W${letter}${rank}`]),
    })),
    { name: doubles.label, tournament_category_id: doubles.id, play_format: 'knockout', teams: teams.map((team) => team.id) },
  ]);

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
  // finish the group stage so the knockout draw with placeholders exists
  const planning = await api('/planning');
  for (const entry of planning.schedule.filter((row) => row.source_type === 'group')) {
    const aWins = entry.player1_name < entry.player2_name;
    await api('/group-matches', { method: 'POST', body: JSON.stringify({
      group_id: entry.bracket_group_id, schedule_id: entry.id, player1_name: entry.player1_name, player2_name: entry.player2_name, phase: 'Grupowa',
      sets: [{ player1_games: aWins ? 4 : 1, player2_games: aWins ? 1 : 4 }, { player1_games: aWins ? 4 : 2, player2_games: aWins ? 2 : 4 }],
    }) });
  }
  await waitUntil('knockout draw', async () => ((await api('/dashboard')).progress.knockout.matches || []).some((row) => /Pocieszenie/.test(row.phase)));
  await api('/quick-info', { method: 'PUT', body: JSON.stringify({ message: `Court 2 opens at 15:00 ${tag}`, active: true }) });
  for (const row of (await api('/dashboard')).matches || []) {
    for (const value of [row.player1_name, row.player2_name, row.winner_name]) if (value) dataStrings.add(value);
  }
  log(`Seeded: B2 K in four groups (stage finished, Vilnius draw with consolation), B1 M doubles knockout of 3 pairs, banner`);

  const findings = new Map(); // snippet → Set of "lang page"
  const record = (lang, where, text, reason) => {
    const key = `${reason}: ${text.slice(0, 90)}`;
    if (!findings.has(key)) findings.set(key, new Set());
    findings.get(key).add(`${lang} ${where}`);
  };
  const audit = async (page, lang, where) => {
    await page.waitForTimeout(700);
    for (const raw of await pageStrings(page)) {
      let text = raw;
      for (const value of dataStrings) text = text.split(value).join(' ');
      if (KEY_PATTERN.test(text) && !/https?:|@/.test(text)) record(lang, where, raw, 'raw key');
      if (lang === 'pl') continue;
      const polishWord = WORD_PATTERN.exec(text)?.[2];
      const lithuanianToo = lang === 'lt' && polishWord === 'Biuro'; // "biuro" is also Lithuanian (of the office)
      if ((lang === 'lt' ? POLISH_ONLY_LETTERS : POLISH_LETTERS).test(text) || (polishWord && !lithuanianToo)) record(lang, where, raw, 'Polish');
    }
  };

  const browser = await launchBrowser(chromium);
  const pageErrors = [];
  try {
    for (const lang of LANGS) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(`${lang}: ${String(error?.message || error).slice(0, 200)}`));
      page.on('dialog', (dialog) => dialog.accept());

      // ——— public ———
      const publicRoutes = [
        ['live', '#live'], ['bracket', '#live/bracket'], ['schedule', '#live/schedule'], ['history', '#live/history'],
        ['tournaments', '#tournaments'], ['tournament bracket', `#tournaments/${tournamentId}/bracket`],
        ['tournament schedule', `#tournaments/${tournamentId}/schedule`], ['tournament matches', `#tournaments/${tournamentId}/matches`],
        ['players', '#players'],
      ];
      for (const [where, hash] of publicRoutes) {
        await page.goto(`${BASE_URL}/?lang=${lang}${hash}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForFunction(() => document.body.innerText.length > 200, undefined, { timeout: 15000 }).catch(() => {});
        await audit(page, lang, `public ${where}`);
      }

      // ——— office ———
      await page.goto(`${BASE_URL}/office/${slot}?lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('input[type="password"]', { timeout: 15000 });
      await audit(page, lang, 'office login');
      await page.locator('input[type="password"]').fill(OFFICE_PASSWORD);
      await page.locator('form button[type="submit"]').click();
      await page.waitForSelector('.office-rail', { state: 'visible', timeout: 20000 });
      const views = ['planning', 'groups', 'progress', 'knockout', 'history', 'quickinfo'];
      for (const view of views) {
        await page.evaluate((id) => Alpine.$data(document.body).openOfficeView(id), view);
        await audit(page, lang, `office ${view}`);
        if (view === 'knockout') {
          const swap = page.locator('[data-knockout-swap]:visible').first();
          if (await swap.count()) {
            await swap.click();
            await audit(page, lang, 'office knockout swap');
            await page.evaluate(() => Alpine.$data(document.body).cancelOfficeKnockoutSwap());
          }
        }
      }
      // rail expanded
      await page.locator('.office-rail').hover();
      await audit(page, lang, 'office rail');
      await page.mouse.move(900, 500);
      // dialogs: new result (walkover and retirement open), correction
      await page.evaluate(() => Alpine.$data(document.body).openAddMatchModal());
      await page.evaluate(() => { const data = Alpine.$data(document.body); data.officeNewMatch.walkover = true; });
      await audit(page, lang, 'office result dialog (walkover)');
      await page.evaluate(() => { const data = Alpine.$data(document.body); data.officeNewMatch.walkover = false; data.officeNewMatch.retirement = true; });
      await audit(page, lang, 'office result dialog (retirement)');
      await page.evaluate(() => Alpine.$data(document.body).closeAddMatchModal());
      await page.evaluate(() => Alpine.$data(document.body).openOfficeView('history'));
      const correct = page.locator('section.office-view:visible button').filter({ hasText: /./ }).first();
      await page.evaluate(() => {
        const data = Alpine.$data(document.body);
        const match = (data.officeMatches || [])[0];
        if (match) data.startOfficeEdit(match);
      });
      await audit(page, lang, 'office correction dialog');
      await page.evaluate(() => Alpine.$data(document.body).closeEditModal?.());
      void correct;
      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (pageErrors.length) log(`Page errors: ${pageErrors.slice(0, 5).join(' | ')}`);
  if (findings.size) {
    const lines = [...findings.entries()].map(([snippet, where]) => {
      const places = [...where];
      return `${snippet}  ← ${places.slice(0, 4).join('; ')}${places.length > 4 ? ` (+${places.length - 4})` : ''}`;
    });
    throw new Error(`${findings.size} untranslated strings:\n${lines.join('\n')}`);
  }
  log(`No raw keys and no Polish text outside Polish in ${LANGS.length} languages (public: 9 sections, office: login, 6 views, rail, knockout swap, result and correction dialogs)`);
  if (!KEEP) await cleanup(adminToken);
}

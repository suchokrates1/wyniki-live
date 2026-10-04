/**
 * What the OBS overlay puts on the stream. The overlay has no screen of its own to look
 * at while a match is on, so a stylesheet change that moves it is only seen on air;
 * this picture catches it first.
 *
 * The data is fixed here rather than in the shared fixtures: one singles match with a
 * finished set, one doubles match in a tie-break with two flags per side, and a narrow
 * board so the compact name layout is in the picture too.
 */
import { expect, test } from '@playwright/test';

const player = (fullName, flag, extra = {}) => ({
  full_name: fullName,
  surname: fullName.split(' ').pop(),
  flag_code: flag,
  points: '0',
  set1: 0,
  set2: 0,
  set3: 0,
  ...extra,
});

const court = (id, order, A, B, extra = {}) => ({
  A,
  B,
  court_name: String(order),
  display_order: order,
  current_set: 2,
  history_meta: { category: 'B1', phase: 'Grupowa' },
  match_status: { active: true, last_completed: null },
  match_time: { running: false, seconds: 0, offset_seconds: 0, started_ts: null, finished_ts: null, resume_ts: null },
  serve: 'A',
  super_tiebreak_active: false,
  tie: { A: 0, B: 0, locked: false, visible: false },
  tournament_id: 28,
  kort_id: id,
  ...extra,
});

const SNAPSHOT = {
  courts: {
    't28-1': court(
      't28-1', 1,
      player('Anna Nowak', 'pl', { points: '40', set1: 6, set2: 3 }),
      player('Béla Kovács', 'hu', { points: '30', set1: 4, set2: 3 }),
      { sets_detail: [{ p1: 6, p2: 4 }] },
    ),
    't28-2': court(
      't28-2', 2,
      player('Jan Kowalski / Ola Wiśniewska', 'pl', { flag_code_partner: 'de', set1: 5, set2: 6 }),
      player('Marta Lis / Piotr Zając', 'cz', { set1: 7, set2: 6 }),
      {
        serve: 'B',
        sets_detail: [{ p1: 5, p2: 7 }],
        tie: { A: 5, B: 6, locked: false, visible: true },
      },
    ),
    't28-3': court(
      't28-3', 3,
      player('Krzysztof Brzęczyszczykiewicz', 'pl', { points: '15', set1: 2 }),
      player('Jean-Baptiste Delacroix', 'fr', { points: 'AD', set1: 1 }),
      { current_set: 1 },
    ),
  },
};

const SETTINGS = {
  tournament_name: 'Puchar Testowy',
  tournament_logo: null,
  overlays: {
    1: {
      name: 'Test',
      auto_hide: false,
      look: { clock: false },
      elements: [
        { type: 'score', court_id: 't28-1', x: 40, y: 40, w: 820, label_text: 'Kort 1' },
        { type: 'score', court_id: 't28-2', x: 40, y: 260, w: 820, label_text: 'Kort 2' },
        { type: 'score', court_id: 't28-3', x: 40, y: 480, w: 440, label_text: 'Kort 3' },
      ],
    },
  },
};

test.skip(({ isMobile }) => isMobile, 'the stream is a 1920×1080 browser source, not a phone');

test('the overlay boards look the way they looked', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: SNAPSHOT }));
  await page.route('**/api/overlay/settings', (route) => route.fulfill({ json: SETTINGS }));
  await page.route('**/api/tournaments/active', (route) => route.fulfill({ json: [{ id: 28, name: 'Puchar Testowy' }] }));
  // Flags come from a CDN; an empty flag keeps its dark placeholder and the picture stays the same offline.
  await page.route('https://flagcdn.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/overlay/1/1');
  await page.addStyleTag({ content: 'html, body { background: #3a4a52 !important; }' });
  await expect(page.locator('.sb-tv')).toHaveCount(3);
  await page.waitForTimeout(800);
  await expect(page).toHaveScreenshot('overlay-boards.png', { animations: 'disabled' });
});

import { expect, test } from '@playwright/test';
import {
  adminApi, authorizeCourt, authorizeCourtApi, api, basicPoint, boardPoints, cleanupFixture, courtSnapshot, createFixture, dismissAnnouncement,
  openUmpire, playGame, startMatch, waitForMatch,
} from './live.js';

async function waitForSnapshot(courtId, predicate, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await courtSnapshot(courtId);
    if (last && predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`overlay ${courtId}: ${message}; last A=${JSON.stringify(last?.A)} B=${JSON.stringify(last?.B)}`);
}

test('Gate 4 / G6: doubles with serve rotation reach the overlay with both names per side', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA G6 doubles', players: 4 });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const [a, b, c, d] = fixture.players;
    await startMatch(page, { players: [a, b, c, d], doubles: true, gamesPerSet: 4, setsToWin: 1 });
    const court = fixture.court(1);
    await waitForSnapshot(court, (snap) => snap.match_status?.active, 'match active');
    await playGame(page, true);
    await playGame(page, false);
    await basicPoint(page, true);
    const snap = await waitForSnapshot(court, (s) => s.A?.current_games === 1 && s.B?.current_games === 1 && s.A?.points === '15', 'games 1:1, 15:0');
    expect(`${snap.A.full_name || ''} ${snap.A.surname || ''}`).toContain(a.last);
    expect(`${snap.A.full_name || ''} ${snap.A.surname || ''}`).toContain(b.last);
    expect(`${snap.B.full_name || ''} ${snap.B.surname || ''}`).toContain(c.last);
    const { match } = await waitForMatch(fixture.marker, (row) => row.player1_name.includes(a.last) && row.player1_name.includes(b.last), { message: 'doubles match "A / B"' });
    expect(match.player1_name).toMatch(/ \/ /);
    expect(match.player2_name).toContain(c.last);
    expect(page.__errors || []).toEqual([]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('Gate 5: airplane mode — five points offline, the overlay catches up when the network is back', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA gate 5 offline' });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const [a, b] = fixture.players;
    await startMatch(page, { players: [a, b], gamesPerSet: 4, setsToWin: 1 });
    const court = fixture.court(1);
    await waitForSnapshot(court, (snap) => snap.match_status?.active, 'match active');

    await context.setOffline(true);
    // game to team 1, then 15:0 in the next game: five points without network
    for (let point = 0; point < 5; point += 1) await basicPoint(page, true);
    await dismissAnnouncement(page);
    await expect(page.getByText(/Offline|Saved locally|queued/i).first()).toBeVisible({ timeout: 10_000 });
    const offlineSnap = await courtSnapshot(court);
    expect(offlineSnap.A.current_games, 'the overlay cannot know yet').toBe(0);

    await context.setOffline(false);
    const snap = await waitForSnapshot(court, (s) => s.A?.current_games === 1 && s.A?.points === '15', 'after reconnect: games 1:0, 15:0', 40_000);
    expect(snap.B.current_games).toBe(0);
    expect(await boardPoints(page)).toContain('15');

    // finish and look for the match in the tablet history
    for (let game = 0; game < 3; game += 1) {
      for (let point = 0; point < (game === 0 ? 3 : 4); point += 1) await basicPoint(page, true);
      await dismissAnnouncement(page);
    }
    await expect(page.getByRole('heading', { name: 'Match Finished!' })).toBeVisible({ timeout: 20_000 });
    await waitForMatch(fixture.marker, (row) => row.player1_name === a.full && row.status === 'finished', { message: 'finished after offline part' });
    await page.goto(`${page.url().split('#')[0]}#/history`);
    await expect(page.locator('h1.ump-title')).toHaveText('Match History', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: new RegExp(`${a.last} vs ${b.last}.*1 : 0`) })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await cleanupFixture(fixture);
  }
});

test('Gate 6: the director moves a live tablet to another court (the Vilnius González–Schmidt case)', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA gate 6 director', courts: 2 });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const [a, b] = fixture.players;
    await startMatch(page, { players: [a, b], gamesPerSet: 4, setsToWin: 1 });
    await basicPoint(page, true);
    const { match } = await waitForMatch(fixture.marker, (row) => row.player1_name === a.full && row.court_id === fixture.court(1), { message: 'match on court 1' });

    await adminApi(`/admin/api/matches/${match.id}/control`, { method: 'POST', body: { court_id: fixture.court(2) } });
    await expect(page.getByText(/director|reżyser/i).first()).toBeVisible({ timeout: 25_000 });
    await waitForSnapshot(fixture.court(2), (s) => s.match_status?.active && s.A?.points === '15', 'court 2 still 15:0 after the move', 20_000);

    // the tablet keeps scoring; everything now lands on court 2
    await basicPoint(page, true);
    await basicPoint(page, true);
    const moved = await waitForSnapshot(fixture.court(2), (s) => s.match_status?.active && s.A?.points === '40', 'court 2 shows 40:0', 30_000);
    expect(`${moved.A.full_name || ''} ${moved.A.surname || ''}`).toContain(a.last);
    const old = await courtSnapshot(fixture.court(1));
    expect(old.match_status?.active, 'court 1 released').not.toBe(true);
    const { match: after } = await waitForMatch(fixture.marker, (row) => row.id === match.id && row.court_id === fixture.court(2), { message: 'match row on court 2' });
    expect(after.court_id).toBe(fixture.court(2));
    expect(page.__errors || []).toEqual([]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('Gate 6b: the director renames a live player and moves the tablet to another court', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA gate 6b rename+court', courts: 2 });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const [a, b] = fixture.players;
    await startMatch(page, { players: [a, b], gamesPerSet: 4, setsToWin: 1 });
    await playGame(page, true);
    await basicPoint(page, true);
    const { match } = await waitForMatch(
      fixture.marker,
      (row) => row.player1_name === a.full && row.court_id === fixture.court(1),
      { message: 'match on court 1' },
    );
    await waitForSnapshot(fixture.court(1), (s) => s.A?.current_games === 1 && s.A?.points === '15', 'court 1 at 1-0 15:0');

    await adminApi(`/admin/api/matches/${match.id}/control`, {
      method: 'POST',
      body: { court_id: fixture.court(2), player1_name: 'Jessica González' },
    });
    await expect(page.getByText(/director|reżyser/i).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.ump-board__name').first()).toContainText('González', { timeout: 10_000 });
    page.__teams = ['González', b.last];

    const moved = await waitForSnapshot(
      fixture.court(2),
      (s) => s.match_status?.active
        && s.A?.points === '15'
        && `${s.A?.full_name || ''} ${s.A?.surname || ''}`.includes('González'),
      'court 2 still 15:0 under González',
      20_000,
    );
    expect(moved.A.current_games).toBe(1);

    await basicPoint(page, true);
    await basicPoint(page, true);
    const after = await waitForSnapshot(
      fixture.court(2),
      (s) => s.match_status?.active && s.A?.points === '40',
      'court 2 shows 40:0 after more points',
      30_000,
    );
    expect(`${after.A.full_name || ''} ${after.A.surname || ''}`).toContain('González');
    const old = await courtSnapshot(fixture.court(1));
    expect(old.match_status?.active, 'court 1 released').not.toBe(true);
    const { match: row } = await waitForMatch(
      fixture.marker,
      (m) => m.id === match.id && m.court_id === fixture.court(2) && m.player1_name === 'Jessica González',
      { message: 'match row renamed and on court 2' },
    );
    expect(row.court_id).toBe(fixture.court(2));
    expect(page.__errors || []).toEqual([]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('Gate 6c: the director corrects the live score and shortens the set format', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA gate 6c score+rules' });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const [a, b] = fixture.players;
    await startMatch(page, { players: [a, b], gamesPerSet: 4, setsToWin: 1 });
    await playGame(page, true);
    await playGame(page, true);
    const court = fixture.court(1);
    const { match } = await waitForMatch(
      fixture.marker,
      (row) => row.player1_name === a.full && row.status === 'in_progress',
      { message: '2-0 in a 4-game set' },
    );
    await waitForSnapshot(court, (s) => s.A?.current_games === 2, 'overlay 2:0 before director');

    await adminApi(`/admin/api/matches/${match.id}/control`, {
      method: 'POST',
      body: {
        score: {
          player1_sets: 0,
          player2_sets: 0,
          player1_games: 2,
          player2_games: 0,
          player1_points: 2,
          player2_points: 0,
        },
        match_config: { games_per_set: 3, sets_to_win: 1, no_advantage: true },
      },
    });
    await expect(page.getByText(/director|reżyser/i).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.ump-board__pts').first()).toHaveText('30', { timeout: 10_000 });
    await waitForSnapshot(court, (s) => s.A?.current_games === 2 && s.A?.points === '30', 'director score 2:0 30:0');

    await basicPoint(page, true);
    await basicPoint(page, true);
    await dismissAnnouncement(page);
    await expect(page.getByRole('heading', { name: 'Match Finished!' })).toBeVisible({ timeout: 20_000 });
    await waitForMatch(
      fixture.marker,
      (row) => row.id === match.id && row.status === 'finished',
      { message: '3-game set ended the match' },
    );
    expect(page.__errors || []).toEqual([]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('P1: a PUT that reaches sets_to_win finishes the match without POST /finish', async () => {
  const fixture = await createFixture({ label: 'P1 server finish' });
  try {
    const court = fixture.court(1);
    const [a, b] = fixture.players;
    const token = await authorizeCourtApi(court);
    const created = await api('/api/matches', {
      method: 'POST',
      token,
      body: {
        court_id: court,
        player1_name: a.full,
        player2_name: b.full,
        status: 'in_progress',
        client_match_uuid: `p1-${Date.now()}`,
        score: {
          player1_sets: 0, player2_sets: 0, player1_games: 0, player2_games: 0,
          player1_points: 0, player2_points: 0, sets_history: [],
        },
        match_config: { games_per_set: 4, sets_to_win: 1 },
      },
    });
    expect(created.status).toBe('in_progress');
    const updated = await api(`/api/matches/${created.id}`, {
      method: 'PUT',
      token,
      body: {
        score: {
          player1_sets: 1,
          player2_sets: 0,
          player1_games: 0,
          player2_games: 0,
          player1_points: 0,
          player2_points: 0,
          sets_history: [{ set_number: 1, player1_games: 4, player2_games: 2 }],
        },
        match_config: { games_per_set: 4, sets_to_win: 1 },
      },
    });
    expect(updated.status).toBe('finished');
    const { match } = await waitForMatch(
      fixture.marker,
      (row) => row.id === created.id && row.status === 'finished',
      { message: 'server auto-finished Malicki–Dutra style PUT' },
    );
    expect(match.status).toBe('finished');
  } finally {
    await cleanupFixture(fixture);
  }
});

test('Gate 7: the PWA survives a browser restart mid-match; a language change between matches keeps the court', async ({ browser }) => {
  const fixture = await createFixture({ label: 'PWA gate 7 restart' });
  const storage = test.info().outputPath('state.json');
  const device = { viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true };
  let context = await browser.newContext(device);
  try {
    let page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const [a, b] = fixture.players;
    await startMatch(page, { players: [a, b], gamesPerSet: 4, setsToWin: 1 });
    await basicPoint(page, true);
    await basicPoint(page, true);
    await expect(page.locator('.ump-board__pts').first()).toHaveText('30');
    await waitForSnapshot(fixture.court(1), (snap) => snap.A?.points === '30', '30:0 on the overlay');

    // "restart Chrome": a new browser with the same site storage (sessionStorage does not survive)
    await context.storageState({ path: storage });
    await context.close();
    context = await browser.newContext({ ...device, storageState: storage });
    page = await openUmpire(context, { language: null });
    await expect(page.locator('h1.ump-title')).toHaveText('Match', { timeout: 10_000 });
    await expect(page.locator('.ump-board__pts').first()).toHaveText('30');
    page.__teams = [a.last, b.last];
    await basicPoint(page, true);
    await waitForSnapshot(fixture.court(1), (snap) => snap.A?.points === '40', 'point after restart on the overlay');
    expect(page.__errors || []).toEqual([]);

    // language between matches: leave the live match, then Settings from the court list
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.goto(`${new URL(page.url()).origin}/umpire#/court`);
    await expect(page.locator('h1.ump-title')).toHaveText(/Choose court|Select Court/, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Polski/ }).click();
    await expect(page.locator('h1.ump-title')).toHaveText('Ustawienia');
    await page.getByRole('button', { name: /Wstecz|Back/ }).first().click();
    await expect(page.locator('h1.ump-title')).toHaveText('Wybierz kort', { timeout: 10_000 });
  } finally {
    await context.close().catch(() => {});
    await cleanupFixture(fixture);
  }
});

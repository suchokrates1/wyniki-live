import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  advancedPoint, artifacts, authorizeCourt, cleanupFixture, courtSnapshot, createFixture, enterPin, loadFixture,
  openUmpire, playGame, startMatch, waitForMatch,
} from './live.js';

/** What the golden comparison looks at: result, sets, events and statistics — no ids or timestamps. */
export function goldenSummary(found, match) {
  const history = found.history.filter((row) => row.match_id === match.id);
  const stats = found.statistics.filter((row) => row.match_id === match.id);
  return {
    status: match.status,
    finish_reason: match.finish_reason,
    winner_is_player1: match.winner_name === match.player1_name,
    sets: [match.score?.player1_sets ?? match.player1_sets, match.score?.player2_sets ?? match.player2_sets],
    sets_history: (match.score?.sets_history || []).map((set) => [set.player1_games, set.player2_games]),
    history_rows: history.length,
    statistics: stats.map((row) => Object.fromEntries(Object.entries(row).filter(([key, value]) => typeof value === 'number' && !/id$|_at$|duration|time/i.test(key)))),
  };
}

test('Gate 2: a wrong PIN keeps the umpire out, the right one reaches the server choice', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA gate 2' });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1, '1111');
    await expect(page.getByText(/Invalid PIN/)).toBeVisible();
    await expect(page.locator('h1.ump-title')).toHaveText('Select Court');
    await page.getByRole('button', { name: /Cancel/ }).click().catch(() => {});
    await page.getByRole('button', { name: /Court 1\b/ }).click();
    await enterPin(page, '4242');
    await startMatch(page, { players: fixture.players.slice(0, 2) });
    await expect(page.locator('.ump-board__name').first()).toContainText(fixture.players[0].last);
    expect(page.__errors || []).toEqual([]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('Gate 3 / G1: the Android scenario (3 games, 1 set, Advanced) ends the same on the server', async ({ context }) => {
  // With UMPIRE_LIVE_MARKER the PWA plays court 2 of the fixture the Android wave played court 1 on.
  const shared = process.env.UMPIRE_LIVE_MARKER;
  const fixture = shared ? await loadFixture(shared) : await createFixture({ label: 'PWA golden G1', players: 4 });
  const courtNumber = shared ? 2 : 1;
  const players = shared ? fixture.players.slice(2, 4) : fixture.players.slice(0, 2);
  try {
    if (shared) {
      const { adminApi } = await import('./live.js');
      await adminApi(`/admin/api/courts/${fixture.court(courtNumber)}/pin`, { method: 'PUT', body: { pin: '4242' } });
    }
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, courtNumber);
    await startMatch(page, { players, advanced: true, gamesPerSet: 3, setsToWin: 1, firstServer: 0 });
    for (let game = 0; game < 3; game += 1) await playGame(page, true, advancedPoint);
    await expect(page.getByRole('heading', { name: 'Match Finished!' })).toBeVisible({ timeout: 20_000 });
    if (process.env.UMPIRE_LIVE_DEBUG) {
      await page.waitForTimeout(3000);
      console.log('  [state]', JSON.stringify(await page.evaluate(() => {
        const data = window.Alpine.$data(document.querySelector('[x-data]'));
        return { sync: data.match?.syncStatus, finished: data.match?.state?.isMatchFinished, matchId: data.match?.state?.matchId, diag: data._diagnostics?.snapshot?.() || null };
      })));
      console.log('  [finalize retry]', await page.evaluate(async () => {
        const data = window.Alpine.$data(document.querySelector('[x-data]'));
        try {
          await data.persistHistory(data.match.state);
        } catch (error) { return 'persistHistory threw: ' + (error?.stack || error); }
        try {
          return JSON.stringify(await data.syncMatch('finalize', data.match.state));
        } catch (error) { return 'syncMatch threw: ' + (error?.stack || error); }
      }));
    }

    const { match, artifacts: found } = await waitForMatch(fixture.marker, (row) => row.player1_name === players[0].full && row.status === 'finished', { message: 'finished PWA match' });
    const summary = goldenSummary(found, match);
    expect(summary.sets).toEqual([1, 0]);
    expect(summary.sets_history).toEqual([[3, 0]]);
    expect(match.court_id).toBe(fixture.court(courtNumber));
    expect(summary.winner_is_player1).toBe(true);
    const snapshot = await courtSnapshot(fixture.court(courtNumber));
    expect(snapshot?.match_status?.active).toBe(false);

    mkdirSync('test-results/umpire-live', { recursive: true });
    writeFileSync('test-results/umpire-live/golden-g1-pwa.json', JSON.stringify({ marker: fixture.marker, summary, match }, null, 2));
    if (shared) {
      const android = found.matches.find((row) => row.player1_name === fixture.players[0].full && row.status === 'finished');
      expect(android, 'Android match of the shared fixture').toBeTruthy();
      const androidSummary = goldenSummary(found, android);
      writeFileSync('test-results/umpire-live/golden-g1-android.json', JSON.stringify({ summary: androidSummary, match: android }, null, 2));
      expect(summary).toEqual(androidSummary);
    }
    expect(page.__errors || []).toEqual([]);
  } finally {
    if (!shared) await cleanupFixture(fixture);
  }
});

test('Gate 3 / G8: finish reasons reach the server; next match keeps the setup', async ({ context }) => {
  const fixture = await createFixture({ label: 'PWA G8', players: 4 });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const reasons = [
      { button: 'Retirement', expected: 'retirement', players: [0, 1] },
      { button: 'Walkover', expected: 'walkover', players: [2, 3] },
      { button: 'Test entry', expected: 'test', players: [0, 2] },
    ];
    for (const [index, reason] of reasons.entries()) {
      const players = reason.players.map((i) => fixture.players[i]);
      if (index > 0) {
        await page.getByRole('button', { name: /New Match|Next Match/ }).first().click();
      }
      await startMatch(page, { players, gamesPerSet: 4, setsToWin: 1 });
      const { basicPoint } = await import('./live.js');
      await basicPoint(page, true);
      await page.getByRole('button', { name: 'Finish Match' }).click();
      await page.getByRole('button', { name: reason.button }).click();
      if (reason.expected !== 'test') {
        // who retired / did not show: the second player
        await page.getByRole('button', { name: new RegExp(players[1].last) }).last().click();
      }
      await expect(page.getByRole('heading', { name: 'Match Finished!' })).toBeVisible({ timeout: 20_000 });
      const { match } = await waitForMatch(fixture.marker, (row) => row.player1_name === players[0].full && row.player2_name === players[1].full && row.status === 'finished', { message: `${reason.expected} finish` });
      expect(match.finish_reason, reason.button).toBe(reason.expected);
      await expect(page.getByRole('button', { name: /Next Match \(same setup\)/ })).toBeVisible();
    }
    const found = await artifacts(fixture.marker);
    expect(found.matches.filter((row) => row.status === 'finished')).toHaveLength(3);
  } finally {
    await cleanupFixture(fixture);
  }
});

import { expect, setNetwork, test } from './device.js';
import {
  advancedPoint, artifacts, authorizeCourt, basicPoint, cleanupFixture, createFixture, dismissAnnouncement, openUmpire, playGame, startMatch,
} from './live.js';

// Gate 8 soak: one tablet umpires many matches in a row on one court — Basic, Advanced and
// doubles, every third with the network gone for a while — and the server, the page and the
// memory stay sound. UMPIRE_SOAK_MATCHES sets how many (skipped without it; 8 = a tournament day).
const MATCHES = Number(process.env.UMPIRE_SOAK_MATCHES || 0);

const KINDS = [
  { name: 'Basic singles', doubles: false, advanced: false, players: [0, 1] },
  { name: 'Advanced singles', doubles: false, advanced: true, players: [2, 3] },
  { name: 'Basic doubles', doubles: true, advanced: false, players: [0, 1, 2, 3] },
];

async function heapMb(page) {
  return page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
}

test('Gate 8 soak: a day of matches on one tablet', async ({ context }) => {
  test.skip(!MATCHES, 'set UMPIRE_SOAK_MATCHES');
  test.setTimeout(MATCHES * 120_000);
  const fixture = await createFixture({ label: 'PWA soak', players: 4 });
  try {
    const page = await openUmpire(context);
    await authorizeCourt(page, fixture, 1);
    const heapStart = await heapMb(page);
    for (let index = 0; index < MATCHES; index += 1) {
      const kind = KINDS[index % KINDS.length];
      const players = kind.players.map((n) => fixture.players[n]);
      // a new setup each time: the next match changes mode or players
      if (index > 0) await page.getByRole('button', { name: /New Match \(different setup\)|new setup/ }).click();
      await startMatch(page, { players, doubles: kind.doubles, advanced: kind.advanced, gamesPerSet: 3, setsToWin: 1 });
      const point = kind.advanced ? advancedPoint : basicPoint;
      const offline = index % 3 === 2;
      try {
        for (let game = 0; game < 3; game += 1) {
          if (offline && game === 1) await setNetwork(context, false);
          await playGame(page, true, point);
          if (offline && game === 1) await setNetwork(context, true);
        }
      } catch (error) {
        // what the tablet showed when the run got stuck
        await page.screenshot({ path: test.info().outputPath(`stuck-match-${index + 1}.png`) }).catch(() => {});
        throw new Error(`match ${index + 1} (${kind.name}${offline ? ', offline part' : ''}): ${error.message}`);
      }
      await dismissAnnouncement(page);
      await expect(page.getByRole('heading', { name: 'Match Finished!' }), `match ${index + 1} (${kind.name})`).toBeVisible({ timeout: 30_000 });
    }

    // every match on the server, finished 3:0 for the first side, the offline ones included
    const deadline = Date.now() + 60_000;
    let finished = [];
    while (Date.now() < deadline) {
      finished = (await artifacts(fixture.marker)).matches.filter((row) => row.status === 'finished');
      if (finished.length >= MATCHES) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(finished, 'finished matches on the server').toHaveLength(MATCHES);
    for (const match of finished) {
      expect(match.score?.sets_history?.map((set) => [set.player1_games, set.player2_games]), match.player1_name).toEqual([[3, 0]]);
    }
    expect(page.__errors || []).toEqual([]);
    const heapEnd = await heapMb(page);
    if (heapStart && heapEnd) {
      test.info().annotations.push({ type: 'heap', description: `${heapStart} MB → ${heapEnd} MB after ${MATCHES} matches` });
      console.log(`  heap ${heapStart} MB → ${heapEnd} MB after ${MATCHES} matches`);
      expect(heapEnd, `JS heap ${heapStart} → ${heapEnd} MB`).toBeLessThan(Math.max(heapStart * 3, heapStart + 40));
    }
  } finally {
    await setNetwork(context, true);
    await cleanupFixture(fixture);
  }
});

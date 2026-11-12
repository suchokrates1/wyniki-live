import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig, StatsMode } from '../match-engine/models.js';
import { matchState } from '../match-engine/testSupport.js';
import { createMatchController } from '../match/matchController.js';
import { createMatchSyncQueue } from './matchSyncQueue.js';

test('PWA sync queue preserves strict order, freezes snapshots, and propagates matchId from create', async () => {
  let releaseCreate;
  const createGate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  const wire = [];

  const queue = createMatchSyncQueue(async (reason, snapshot, extra) => {
    if (reason === 'create') {
      await createGate;
      wire.push({
        op: 'create',
        matchId: snapshot.matchId,
        p1Points: snapshot.player1Points,
        p1Games: snapshot.player1Games,
      });
      return { matchId: 404 };
    }
    wire.push({
      op: reason === 'event' ? `event:${extra?.eventType}` : reason,
      matchId: snapshot.matchId,
      p1Points: snapshot.player1Points,
      p1Games: snapshot.player1Games,
    });
    return { matchId: snapshot.matchId };
  });

  const pending = [];
  const ctl = createMatchController({
    now: () => 1_000,
    onSync: (reason, state, extra) => {
      const p = queue.enqueue(reason, state, extra);
      pending.push(p);
      return p;
    },
  });

  const live = matchState({
    clientMatchUuid: 'pwa-seq-1',
    matchConfig: new MatchConfig({ gamesPerSet: 4, setsToWin: 1, noAdvantage: true, statsMode: StatsMode.BASIC }),
    noAdvantage: true,
    statsMode: StatsMode.BASIC,
  });

  ctl.initialize(live);
  ctl.setFirstServer(1);

  // Score four points rapidly while `create` is still waiting on the network.
  ctl.handleBasicWin(true);
  ctl.handleBasicWin(true);
  ctl.handleBasicWin(true);
  ctl.handleBasicWin(true);

  // Nothing beyond `create` may have run yet.
  assert.deepEqual(wire, []);

  releaseCreate();
  await Promise.all(pending);

  assert.equal(ctl.state.matchId, 404);
  assert.deepEqual(wire, [
    { op: 'create', matchId: null, p1Points: 0, p1Games: 0 },
    { op: 'event:match_start', matchId: 404, p1Points: 0, p1Games: 0 },
    { op: 'event:point', matchId: 404, p1Points: 1, p1Games: 0 },
    { op: 'event:point', matchId: 404, p1Points: 2, p1Games: 0 },
    { op: 'event:point', matchId: 404, p1Points: 3, p1Games: 0 },
    { op: 'event:point', matchId: 404, p1Points: 4, p1Games: 0 },
    { op: 'event:game', matchId: 404, p1Points: 0, p1Games: 1 },
    { op: 'update', matchId: 404, p1Points: 0, p1Games: 1 },
  ]);
});

test('PWA sync queue skips duplicate finalize for the same match UUID', async () => {
  let finalizeRuns = 0;
  const queue = createMatchSyncQueue(async (reason, snapshot) => {
    if (reason === 'finalize') finalizeRuns += 1;
    return { matchId: snapshot.matchId ?? 88 };
  });

  const s = matchState({ clientMatchUuid: 'dup-fin-1', matchId: 88 });
  s.matchId = 88;
  await Promise.all([
    queue.enqueue('finalize', s),
    queue.enqueue('finalize', s),
  ]);

  assert.equal(finalizeRuns, 1);
});

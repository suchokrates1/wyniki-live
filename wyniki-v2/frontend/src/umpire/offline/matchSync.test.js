import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { createMemoryTable } from './memoryTable.js';
import { syncMatchLive } from './matchSync.js';
import { createOutbox } from './outbox.js';
import { MutationType } from './syncRules.js';

function apiStub(handlers) {
  return {
    createMatch: handlers.createMatch || (async () => ({ ok: true, status: 200, data: { id: 5 } })),
    updateMatch: handlers.updateMatch || (async () => ({ ok: true, status: 200, data: {} })),
    finishMatch: handlers.finishMatch || (async () => ({ ok: true, status: 200, data: {} })),
    sendStatistics: handlers.sendStatistics || (async () => ({ ok: true, status: 200, data: {} })),
    logMatchEvent: handlers.logMatchEvent || (async () => ({ ok: true, status: 200, data: {} })),
  };
}

test('500 queues an UPDATE; 403 drops the stale queue', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const state = matchState({ matchId: 9, clientMatchUuid: 'uuid-1' });
  state.matchId = 9;
  state.clientMatchUuid = 'uuid-1';
  state.matchStartTime = 1;

  await syncMatchLive({
    api: apiStub({ updateMatch: async () => ({ ok: false, status: 500, data: null }) }),
    outbox,
    reason: 'update',
    state,
    online: () => true,
  });
  assert.equal((await outbox.pending())[0].type, MutationType.UPDATE);

  await syncMatchLive({
    api: apiStub({ updateMatch: async () => ({ ok: false, status: 403, data: null }) }),
    outbox,
    reason: 'update',
    state,
    online: () => true,
  });
  assert.equal((await outbox.pending()).length, 0);
});

test('offline create is queued without calling the API', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const state = matchState({ clientMatchUuid: 'uuid-2' });
  state.clientMatchUuid = 'uuid-2';
  let called = false;
  await syncMatchLive({
    api: apiStub({ createMatch: async () => { called = true; return { ok: true, status: 200, data: { id: 1 } }; } }),
    outbox,
    reason: 'create',
    state,
    online: () => false,
  });
  assert.equal(called, false);
  assert.equal((await outbox.pending())[0].type, MutationType.CREATE);
});

test('offline point event is queued as EVENT', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const state = matchState({ matchId: 9, clientMatchUuid: 'uuid-3' });
  state.matchId = 9;
  state.clientMatchUuid = 'uuid-3';
  let called = false;
  await syncMatchLive({
    api: apiStub({ logMatchEvent: async () => { called = true; return { ok: true, status: 200, data: {} }; } }),
    outbox,
    reason: 'event',
    state,
    extra: { eventType: 'point' },
    online: () => false,
  });
  assert.equal(called, false);
  assert.equal((await outbox.pending())[0].type, MutationType.EVENT);
  assert.equal((await outbox.pending())[0].payload.event_type, 'point');
});

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

test('a failed fetch (status 0) queues an UPDATE even when the browser still says online', async () => {
  // Real api.js never throws: timeout / ECONNREFUSED become { ok: false, status: 0 }.
  // iPad Safari keeps navigator.onLine true after the e2e harness stops gunicorn.
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const state = matchState({ matchId: 9, clientMatchUuid: 'uuid-status-0' });
  state.matchId = 9;
  state.clientMatchUuid = 'uuid-status-0';
  state.matchStartTime = 1;

  const result = await syncMatchLive({
    api: apiStub({ updateMatch: async () => ({ ok: false, status: 0, data: null }) }),
    outbox,
    reason: 'update',
    state,
    online: () => true,
  });
  assert.equal(result.failed, true);
  assert.equal((await outbox.pending()).length, 1);
  assert.equal((await outbox.pending())[0].type, MutationType.UPDATE);
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

test('update with null matchId waits as UPDATE — never opens a second CREATE', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const state = matchState({ clientMatchUuid: 'uuid-dup' });
  state.clientMatchUuid = 'uuid-dup';
  state.matchId = null;
  let createCalls = 0;
  const result = await syncMatchLive({
    api: apiStub({
      createMatch: async () => { createCalls += 1; return { ok: true, status: 201, data: { id: 99 } }; },
    }),
    outbox,
    reason: 'update',
    state,
    online: () => true,
  });
  assert.equal(createCalls, 0);
  assert.equal(result.waitingForCreate, true);
  assert.equal((await outbox.pending())[0].type, MutationType.UPDATE);

  await syncMatchLive({
    api: apiStub({ createMatch: async () => { createCalls += 1; return { ok: true, status: 201, data: { id: 99 } }; } }),
    outbox,
    reason: 'update',
    state,
    online: () => false,
  });
  assert.equal(createCalls, 0);
  const types = (await outbox.pending()).map((row) => row.type);
  assert.ok(types.every((t) => t === MutationType.UPDATE), types);
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

test('create success returns bracketWarning from the API', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const state = matchState({ clientMatchUuid: 'uuid-br' });
  state.clientMatchUuid = 'uuid-br';
  const result = await syncMatchLive({
    api: apiStub({
      createMatch: async () => ({
        ok: true,
        status: 201,
        data: { id: 44, bracket_warning: 'different_groups' },
      }),
    }),
    outbox,
    reason: 'create',
    state,
    online: () => true,
  });
  assert.equal(result.matchId, 44);
  assert.equal(result.bracketWarning, 'different_groups');
});

function finishedState(uuid, matchId = 9) {
  const state = matchState({ matchId, clientMatchUuid: uuid });
  state.matchId = matchId;
  state.clientMatchUuid = uuid;
  state.matchStartTime = 1;
  state.isMatchFinished = true;
  state.player1Sets = 2;
  state.player2Sets = 0;
  return state;
}

async function queuedTypes(outbox) {
  return (await outbox.pending()).map((row) => row.type);
}

const networkDown = async () => { throw new TypeError('Failed to fetch'); };
const answers = (status) => async () => ({ ok: false, status, data: null });

test('finalize: a network error on the final score queues the score, the finish and the statistics', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const result = await syncMatchLive({
    api: apiStub({ updateMatch: networkDown }),
    outbox,
    reason: 'finalize',
    state: finishedState('uuid-f1'),
    online: () => true, // the browser still believes it is online
  });
  assert.equal(result.failed, true);
  assert.deepEqual(await queuedTypes(outbox), ['UPDATE', 'FINISH', 'STATS']);
});

test('finalize: a network error on the finish itself queues the finish and the statistics, not the score again', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await syncMatchLive({
    api: apiStub({ finishMatch: networkDown }),
    outbox,
    reason: 'finalize',
    state: finishedState('uuid-f2'),
    online: () => true,
  });
  assert.deepEqual(await queuedTypes(outbox), ['FINISH', 'STATS']);
});

test('finalize: an expired court session (401) keeps the whole result for after the next PIN', async () => {
  for (const failing of ['updateMatch', 'finishMatch']) {
    const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
    const result = await syncMatchLive({
      api: apiStub({ [failing]: answers(401) }),
      outbox,
      reason: 'finalize',
      state: finishedState(`uuid-401-${failing}`),
      online: () => true,
    });
    assert.equal(result.status, 401);
    const types = await queuedTypes(outbox);
    assert.ok(types.includes('FINISH') && types.includes('STATS'), `${failing}: ${types}`);
    assert.equal(types.includes('UPDATE'), failing === 'updateMatch');
  }
});

test('finalize: a server error on the final score still queues the finish', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await syncMatchLive({
    api: apiStub({ updateMatch: answers(503) }),
    outbox,
    reason: 'finalize',
    state: finishedState('uuid-503'),
    online: () => true,
  });
  assert.deepEqual(await queuedTypes(outbox), ['UPDATE', 'FINISH', 'STATS']);
});

test('finalize: a plain refusal (400) is reported and not queued', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const result = await syncMatchLive({
    api: apiStub({ finishMatch: answers(400) }),
    outbox,
    reason: 'finalize',
    state: finishedState('uuid-400'),
    online: () => true,
  });
  assert.equal(result.status, 400);
  assert.deepEqual(await queuedTypes(outbox), []);
});

test('finalize offline: the queued finish carries the API field names, also for a walkover', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await syncMatchLive({
    api: apiStub({}),
    outbox,
    reason: 'finalize',
    state: finishedState('uuid-wo'),
    extra: { finishReason: 'WALKOVER', winnerName: 'A', injuredPlayerName: null, resultNote: 'no show' },
    online: () => false,
  });
  const finish = (await outbox.pending()).find((row) => row.type === MutationType.FINISH);
  assert.equal(finish.payload.winner_name, 'A');
  assert.equal(finish.payload.result_note, 'no show');
  assert.ok('finish_reason' in finish.payload);
  assert.equal('finishReason' in finish.payload, false);
});

test('finalize: a match the server has not seen yet is created, then finished', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  const calls = [];
  const state = finishedState('uuid-new', null);
  const result = await syncMatchLive({
    api: apiStub({
      createMatch: async () => { calls.push('create'); return { ok: true, status: 201, data: { id: 31 } }; },
      finishMatch: async (id) => { calls.push(`finish ${id}`); return { ok: true, status: 200, data: {} }; },
    }),
    outbox,
    reason: 'finalize',
    state,
    online: () => true,
  });
  assert.deepEqual(calls, ['create', 'finish 31']);
  assert.equal(result.matchId, 31);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTable } from './memoryTable.js';
import { createOutbox } from './outbox.js';
import { MutationType } from './syncRules.js';

test('UPDATE coalesces and 403 drops pending rows for that match', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.UPDATE, payload: { n: 1 }, serverMatchId: 9 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.UPDATE, payload: { n: 2 }, serverMatchId: 9 });
  assert.equal((await outbox.pending()).length, 1);
  assert.equal((await outbox.pending())[0].payload.n, 2);

  const result = await outbox.flush(async () => ({ ok: false, status: 403 }));
  assert.equal(result.dropped, 1);
  assert.equal((await outbox.pending()).length, 0);
});

test('CREATE succeeds first and backfills server id', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.CREATE, payload: { court_id: '1' } });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.UPDATE, payload: { n: 3 } });
  const seen = [];
  await outbox.flush(async (mutation) => {
    seen.push(mutation.type);
    if (mutation.type === MutationType.CREATE) return { ok: true, status: 200, matchId: 77 };
    assert.equal(mutation.serverMatchId, 77);
    return { ok: true, status: 200 };
  });
  assert.deepEqual(seen, ['CREATE', 'UPDATE']);
  assert.equal((await outbox.pending()).length, 0);
});

test('CREATE dropped with 403 also drops UPDATE/FINISH/STATS for that UUID', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u-drop', type: MutationType.CREATE, payload: { court_id: '1' } });
  await outbox.enqueue({ clientMatchUuid: 'u-drop', type: MutationType.UPDATE, payload: { n: 1 } });
  await outbox.enqueue({ clientMatchUuid: 'u-drop', type: MutationType.FINISH, payload: {} });
  await outbox.enqueue({ clientMatchUuid: 'u-drop', type: MutationType.STATS, payload: {} });
  await outbox.enqueue({ clientMatchUuid: 'other', type: MutationType.FINISH, payload: {}, serverMatchId: 3 });

  await outbox.flush(async (mutation) => {
    if (mutation.type === MutationType.CREATE) return { ok: false, status: 403 };
    // Unrelated match: keep it pending so we can see the DROP did not sweep other UUIDs.
    throw new Error('leave other');
  });
  const pending = await outbox.pending();
  assert.equal(pending.filter((row) => row.clientMatchUuid === 'u-drop').length, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].clientMatchUuid, 'other');
});

test('network errors stay pending for later flush', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.UPDATE, payload: {}, serverMatchId: 1 });
  await outbox.flush(async () => {
    throw new Error('offline');
  });
  assert.equal((await outbox.pending()).length, 1);
  assert.equal((await outbox.pending())[0].lastError, 'offline');
});

test('a row refused with 401 goes out with the first flush after the court session is back', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.FINISH, payload: {}, serverMatchId: 6 });
  const refused = await outbox.flush(async () => ({ ok: false, status: 401 }));
  assert.equal(refused.stoppedOnAuth, true);
  assert.equal((await outbox.pending()).length, 1);

  let sent = 0;
  await outbox.flush(async () => { sent += 1; return { ok: true, status: 200 }; });
  assert.equal(sent, 1);
  assert.equal((await outbox.pending()).length, 0);
});

test('a request the server keeps refusing with 400 is given up after five tries', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.FINISH, payload: {}, serverMatchId: 5 });
  let sent = 0;
  for (let i = 0; i < 8; i += 1) {
    await outbox.flush(async () => { sent += 1; return { ok: false, status: 400 }; });
  }
  assert.equal(sent, 5);
  assert.equal((await outbox.pending()).length, 0);
});

test('a row waiting for its server match id is not counted as refused', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.FINISH, payload: {} });
  for (let i = 0; i < 8; i += 1) {
    await outbox.flush(async () => ({ ok: false, status: 0 }));
  }
  const rows = await outbox.pending();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attempts, 0);
});

test('two flushes started together send each row once', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.FINISH, payload: {}, serverMatchId: 5 });
  let sent = 0;
  const dispatch = async () => {
    sent += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, status: 200 };
  };
  await Promise.all([outbox.flush(dispatch), outbox.flush(dispatch)]);
  assert.equal(sent, 1);
});

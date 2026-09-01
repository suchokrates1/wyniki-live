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

test('network errors stay pending for later flush', async () => {
  const outbox = createOutbox({ table: createMemoryTable(), now: () => 1 });
  await outbox.enqueue({ clientMatchUuid: 'u1', type: MutationType.UPDATE, payload: {}, serverMatchId: 1 });
  await outbox.flush(async () => {
    throw new Error('offline');
  });
  assert.equal((await outbox.pending()).length, 1);
  assert.equal((await outbox.pending())[0].lastError, 'offline');
});

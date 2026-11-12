import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMemoryTable } from './memoryTable.js';
import { createOutbox } from './outbox.js';

const fixturePath = fileURLToPath(new URL('./outboxFixtures.json', import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));

const androidFixturePath = path.resolve(
  process.env.ANDROID_OUTBOX_FIXTURES
    || 'C:/Users/sucho/Vest Tennis/android-tennis-referee/app/src/test/resources/outboxFixtures.json',
);

test(
  'outboxFixtures.json matches Android test resources byte-for-byte',
  { skip: existsSync(androidFixturePath) ? false : `no Android checkout at ${androidFixturePath}` },
  () => {
    const jsParsed = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const ktParsed = JSON.parse(readFileSync(androidFixturePath, 'utf8'));
    assert.deepEqual(ktParsed, jsParsed);
  },
);

for (const scenario of fixtures.scenarios) {
  test(`outbox fixture ${scenario.id}: ${scenario.description}`, async () => {
    let clock = 1_000;
    const outbox = createOutbox({
      table: createMemoryTable(),
      now: () => {
        clock += 1;
        return clock;
      },
    });

    for (const item of scenario.enqueue) {
      await outbox.enqueue({
        clientMatchUuid: item.clientMatchUuid,
        type: item.type,
        payload: { fixture: scenario.id },
        serverMatchId: item.serverMatchId,
      });
    }

    for (let pass = 0; pass < scenario.flushes.length; pass += 1) {
      const step = scenario.flushes[pass];
      const queue = [...step.responses];
      const calls = [];

      const result = await outbox.flush(async (mutation) => {
        if ((mutation.type === 'UPDATE' || mutation.type === 'FINISH') && mutation.serverMatchId == null) {
          return { ok: false, status: 0 };
        }
        calls.push({ type: mutation.type, serverMatchId: mutation.serverMatchId ?? null });
        const next = queue.shift();
        assert.ok(next, `${scenario.id} pass ${pass}: unexpected extra network call`);
        if (next.networkError) {
          throw new Error('offline');
        }
        const ok = next.status >= 200 && next.status < 300;
        return {
          ok,
          status: next.status,
          matchId: next.createdId ?? mutation.serverMatchId ?? undefined,
        };
      });

      assert.deepEqual(calls, step.expectCalls, `${scenario.id} pass ${pass} calls`);
      assert.deepEqual(
        {
          flushed: result.flushed,
          failed: result.failed,
          dropped: result.dropped,
          stoppedOnAuth: result.stoppedOnAuth,
        },
        step.expectResult,
        `${scenario.id} pass ${pass} result`,
      );
      const pendingTypes = (await outbox.pending()).map((row) => row.type);
      assert.deepEqual(pendingTypes, step.expectPendingTypes, `${scenario.id} pass ${pass} pending`);
    }
  });
}

import { MutationStatus, MutationType, classifyHttp } from './syncRules.js';

export function createOutbox({ table, now = () => Date.now() } = {}) {
  async function pending() {
    return (await table.all())
      .filter((row) => row.status === MutationStatus.PENDING || row.status === MutationStatus.IN_FLIGHT)
      .sort((a, b) => {
        if (a.type === MutationType.CREATE && b.type !== MutationType.CREATE) return -1;
        if (b.type === MutationType.CREATE && a.type !== MutationType.CREATE) return 1;
        return a.createdAt - b.createdAt;
      });
  }

  async function enqueue({ clientMatchUuid, type, payload, serverMatchId = null }) {
    if (type === MutationType.UPDATE) {
      const older = (await table.all()).filter((row) => (
        row.clientMatchUuid === clientMatchUuid
        && row.type === MutationType.UPDATE
        && row.status === MutationStatus.PENDING
      ));
      await Promise.all(older.map((row) => table.delete(row.id)));
    }
    return table.put({
      clientMatchUuid,
      type,
      payload,
      serverMatchId,
      createdAt: now(),
      attempts: 0,
      lastError: null,
      status: MutationStatus.PENDING,
    });
  }

  async function dropPendingForMatch(clientMatchUuid, types = [MutationType.UPDATE, MutationType.EVENT, MutationType.FINISH, MutationType.STATS]) {
    const rows = await table.all();
    await Promise.all(rows
      .filter((row) => row.clientMatchUuid === clientMatchUuid && types.includes(row.type) && row.status !== MutationStatus.DONE)
      .map((row) => table.delete(row.id)));
  }

  async function propagateServerMatchId(clientMatchUuid, serverMatchId) {
    const rows = await table.all();
    await Promise.all(rows
      .filter((row) => row.clientMatchUuid === clientMatchUuid && row.serverMatchId == null)
      .map((row) => table.put({ ...row, serverMatchId })));
  }

  async function flush(dispatch) {
    const queue = await pending();
    const resolvedIds = {};
    let flushed = 0;
    let dropped = 0;
    let failed = 0;
    let stoppedOnAuth = false;

    for (const row of queue) {
      const serverMatchId = row.serverMatchId ?? resolvedIds[row.clientMatchUuid] ?? null;
      const next = { ...row, attempts: row.attempts + 1, status: MutationStatus.IN_FLIGHT };
      await table.put(next);
      try {
        const result = await dispatch({ ...next, serverMatchId });
        const status = result?.status ?? 0;
        const kind = result?.ok ? 'OK' : classifyHttp(status);
        if (kind === 'OK') {
          if (row.type === MutationType.CREATE && result.matchId != null) {
            resolvedIds[row.clientMatchUuid] = result.matchId;
            await propagateServerMatchId(row.clientMatchUuid, result.matchId);
          }
          await table.delete(row.id);
          flushed += 1;
        } else if (kind === 'AUTH') {
          await table.put({ ...next, status: MutationStatus.FAILED_AUTH, lastError: `HTTP ${status}` });
          stoppedOnAuth = true;
          failed += 1;
          break;
        } else if (kind === 'DROP') {
          await dropPendingForMatch(row.clientMatchUuid);
          dropped += 1;
        } else {
          await table.put({ ...next, status: MutationStatus.PENDING, lastError: `HTTP ${status || 'network'}` });
          failed += 1;
        }
      } catch (error) {
        await table.put({
          ...next,
          status: MutationStatus.PENDING,
          lastError: error?.message || 'network',
        });
        failed += 1;
      }
    }

    return { flushed, dropped, failed, stoppedOnAuth };
  }

  return {
    enqueue,
    pending,
    dropPendingForMatch,
    propagateServerMatchId,
    flush,
  };
}

export function createOutboxDispatcher(api) {
  return async function dispatch(mutation) {
    switch (mutation.type) {
      case MutationType.CREATE: {
        const result = await api.createMatch(mutation.payload);
        return { ok: result.ok, status: result.status, matchId: result.data?.id };
      }
      case MutationType.UPDATE: {
        if (mutation.serverMatchId == null) return { ok: false, status: 0 };
        const result = await api.updateMatch(mutation.serverMatchId, mutation.payload);
        return { ok: result.ok, status: result.status, matchId: mutation.serverMatchId };
      }
      case MutationType.FINISH: {
        if (mutation.serverMatchId == null) return { ok: false, status: 0 };
        const result = await api.finishMatch(mutation.serverMatchId, mutation.payload);
        return { ok: result.ok, status: result.status };
      }
      case MutationType.EVENT: {
        const result = await api.logMatchEvent(mutation.payload);
        return { ok: result.ok, status: result.status };
      }
      case MutationType.STATS: {
        const result = await api.sendStatistics(mutation.payload);
        return { ok: result.ok, status: result.status };
      }
      default:
        return { ok: false, status: 0 };
    }
  };
}

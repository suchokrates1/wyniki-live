import { MAX_REFUSED_ATTEMPTS, MutationStatus, MutationType, classifyHttp } from './syncRules.js';

// FAILED_AUTH waits for a new court session; the next flush simply tries it again and
// stops at once if the session is still missing.
const WAITING = [MutationStatus.PENDING, MutationStatus.IN_FLIGHT, MutationStatus.FAILED_AUTH];

export function createOutbox({ table, now = () => Date.now() } = {}) {
  let flushing = null;

  async function pending() {
    return (await table.all())
      .filter((row) => WAITING.includes(row.status))
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

  // One flush at a time: 'online' and 'visibilitychange' often fire together, and two
  // passes over the same rows would send each of them twice.
  function flush(dispatch) {
    if (!flushing) {
      flushing = flushOnce(dispatch).finally(() => { flushing = null; });
    }
    return flushing;
  }

  async function flushOnce(dispatch) {
    const queue = await pending();
    const resolvedIds = {};
    let flushed = 0;
    let dropped = 0;
    let failed = 0;
    let stoppedOnAuth = false;

    for (let index = 0; index < queue.length; index += 1) {
      const row = queue[index];
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
          await table.delete(row.id);
          if (row.type === MutationType.CREATE) {
            // No create will ever supply a serverMatchId for this UUID — drop dependents
            // that would otherwise sit forever with status 0 / "no server match id".
            await dropCreateDependents(row.clientMatchUuid, queue, index);
          }
          dropped += 1;
        } else if (kind === 'FAIL' && status >= 400 && next.attempts >= MAX_REFUSED_ATTEMPTS) {
          // the server refuses this request itself; sending it forever helps nobody
          await table.put({ ...next, status: MutationStatus.FAILED, lastError: `HTTP ${status}` });
          if (row.type === MutationType.CREATE) {
            await dropCreateDependents(row.clientMatchUuid, queue, index);
          }
          failed += 1;
        } else {
          // status 0 means it was not sent at all (no server match id yet): that is not an attempt
          const attempts = status ? next.attempts : row.attempts;
          await table.put({ ...next, attempts, status: MutationStatus.PENDING, lastError: `HTTP ${status || 'network'}` });
          failed += 1;
        }
      } catch (error) {
        await table.put({
          ...next,
          status: MutationStatus.PENDING,
          lastError: error?.message || 'network',
        });
        failed += queue.length - index;
        break;
      }
    }

    return { flushed, dropped, failed, stoppedOnAuth };
  }

  async function dropCreateDependents(clientMatchUuid, queue, index) {
    const types = [
      MutationType.UPDATE, MutationType.EVENT, MutationType.FINISH, MutationType.STATS,
    ];
    await dropPendingForMatch(clientMatchUuid, types);
    // pending() was snapshotted at the start of this flush — strip the same rows here
    // so a later UPDATE/FINISH in this pass is not resurrected after the DB delete.
    const dropTypes = new Set(types);
    for (let j = index + 1; j < queue.length; j += 1) {
      if (queue[j].clientMatchUuid === clientMatchUuid && dropTypes.has(queue[j].type)) {
        queue.splice(j, 1);
        j -= 1;
      }
    }
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
        if (mutation.serverMatchId == null) return { ok: false, status: 0 };
        const payload = mutation.payload?.match_id === mutation.serverMatchId
          ? mutation.payload
          : { ...mutation.payload, match_id: mutation.serverMatchId };
        const result = await api.sendStatistics(payload);
        return { ok: result.ok, status: result.status };
      }
      default:
        return { ok: false, status: 0 };
    }
  };
}

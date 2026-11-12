import { snapshotMatchStateForSync } from '../match/matchStateIo.js';

/**
 * Sequential queue for PWA match synchronization.
 *
 * Ensures that `create`, point `event`s, `update`s and `finalize` execute strictly in the
 * order the umpire tapped them, on detached MatchState snapshots, and propagates the
 * `matchId` returned by `create` onto every subsequent queued operation for that match.
 */
export function createMatchSyncQueue(runSync) {
  let tail = Promise.resolve();
  const resolvedIds = new Map();
  const finalizedUuids = new Set();

  function enqueue(reason, state, extra = null) {
    const snapshot = snapshotMatchStateForSync(state);
    const task = async () => {
      if (!snapshot) return { failed: false };
      const uuid = snapshot.clientMatchUuid;
      if (snapshot.matchId != null) {
        resolvedIds.set(uuid, snapshot.matchId);
      } else if (resolvedIds.has(uuid)) {
        snapshot.matchId = resolvedIds.get(uuid);
      }

      if (reason === 'finalize') {
        if (finalizedUuids.has(uuid)) {
          return { matchId: snapshot.matchId ?? null, duplicateFinalizeSkipped: true };
        }
        finalizedUuids.add(uuid);
      }

      const result = await runSync(reason, snapshot, extra);
      if (result?.matchId != null && uuid) {
        resolvedIds.set(uuid, result.matchId);
      }
      return result;
    };

    const next = tail.then(task, task);
    // Keep the queue alive even if an individual step rejects.
    tail = next.catch(() => {});
    return next;
  }

  return { enqueue };
}

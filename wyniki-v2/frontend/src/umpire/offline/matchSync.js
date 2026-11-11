import { FinishMatchRequest } from '../match-engine/models.js';
import { toFinishPayload, toMatchEventPayload, toMatchPayload, toStatisticsPayload } from '../match/matchPayload.js';
import { MutationType, classifyHttp } from './syncRules.js';

// Finishing a match is three requests in a fixed order: the final score, the finish,
// the statistics. Whichever of them cannot be delivered now, that one and every later
// one go to the queue, so the result never depends on the first attempt.
const FinalizeStep = Object.freeze({ SCORE: 'score', FINISH: 'finish', STATS: 'stats' });

export async function syncMatchLive({
  api,
  outbox,
  reason,
  state,
  extra = null,
  online = () => globalThis.navigator?.onLine !== false,
}) {
  const payload = toMatchPayload(state);
  const eventPayload = reason === 'event' ? toMatchEventPayload(state, extra?.eventType || 'point') : null;

  if (!online()) {
    if (reason === 'event') {
      await enqueue(outbox, state, MutationType.EVENT, eventPayload);
    } else if (reason === 'finalize') {
      await enqueueFinalize({ outbox, state, extra, from: FinalizeStep.SCORE });
    } else {
      await enqueue(outbox, state, scoreMutationType(state), payload);
    }
    return { failed: true, offline: true };
  }

  // what a network error in the middle of the sequence still has to deliver
  let finalizeFrom = FinalizeStep.SCORE;
  try {
    if (reason === 'event') {
      const result = await api.logMatchEvent(eventPayload);
      if (result.ok) return { matchId: state.matchId };
      return handleFailure({ outbox, state, result, online, type: MutationType.EVENT, payload: eventPayload });
    }

    let matchId = state.matchId;
    let bracketWarning = null;
    if (reason === 'create' || matchId == null) {
      const created = await api.createMatch(payload);
      if (!created.ok) {
        return handleFailure({
          outbox, state, extra, result: created, online, type: MutationType.CREATE, payload,
          finalizeFrom: reason === 'finalize' ? FinalizeStep.SCORE : null,
        });
      }
      matchId = created.data?.id;
      bracketWarning = created.data?.bracket_warning || created.data?.bracketWarning || null;
      if (reason !== 'finalize' || matchId == null) return { matchId, bracketWarning };
    } else {
      const update = await api.updateMatch(matchId, payload);
      if (!update.ok) {
        return handleFailure({
          outbox, state, extra, result: update, online, type: MutationType.UPDATE, payload,
          finalizeFrom: reason === 'finalize' ? FinalizeStep.SCORE : null,
        });
      }
    }

    if (reason === 'finalize') {
      finalizeFrom = FinalizeStep.FINISH;
      const finishPayload = finishPayloadFor(state, extra);
      const finish = await api.finishMatch(matchId, finishPayload);
      if (!finish.ok) {
        return handleFailure({
          outbox, state, extra, result: finish, online, type: MutationType.FINISH, payload: finishPayload,
          finalizeFrom: FinalizeStep.FINISH, matchId,
        });
      }
      finalizeFrom = FinalizeStep.STATS;
      const stats = toStatisticsPayload({ ...state, matchId });
      if (stats) {
        const sent = await api.sendStatistics(stats);
        if (!sent.ok) await enqueue(outbox, state, MutationType.STATS, stats, matchId);
      }
    }
    return { matchId, bracketWarning };
  } catch {
    // The request never got an answer (the browser may still call itself online).
    if (reason === 'event') {
      await enqueue(outbox, state, MutationType.EVENT, eventPayload);
    } else if (reason === 'finalize') {
      await enqueueFinalize({ outbox, state, extra, from: finalizeFrom });
    } else {
      await enqueue(outbox, state, scoreMutationType(state), payload);
    }
    return { failed: true, offline: !online() };
  }
}

function scoreMutationType(state) {
  return state.matchId == null ? MutationType.CREATE : MutationType.UPDATE;
}

function finishPayloadFor(state, request) {
  return toFinishPayload(request || new FinishMatchRequest({
    finishReason: state.finishReason,
    winnerName: state.finishWinnerName,
    injuredPlayerName: state.injuredPlayerName,
    resultNote: state.resultNote,
  }));
}

function enqueue(outbox, state, type, payload, serverMatchId = state.matchId) {
  return outbox.enqueue({ clientMatchUuid: state.clientMatchUuid, type, payload, serverMatchId });
}

async function enqueueFinalize({ outbox, state, extra, from, matchId = state.matchId }) {
  if (from === FinalizeStep.SCORE) {
    await enqueue(outbox, state, scoreMutationType(state), toMatchPayload(state));
  }
  if (from === FinalizeStep.SCORE || from === FinalizeStep.FINISH) {
    await enqueue(outbox, state, MutationType.FINISH, finishPayloadFor(state, extra), matchId);
  }
  const stats = toStatisticsPayload(matchId == null ? state : { ...state, matchId });
  if (stats) await enqueue(outbox, state, MutationType.STATS, stats, matchId);
}

async function handleFailure({ outbox, state, extra, result, online, type, payload, finalizeFrom = null, matchId }) {
  const kind = classifyHttp(result.status);
  if (kind === 'DROP') {
    await outbox.dropPendingForMatch(state.clientMatchUuid);
    return { failed: true, status: result.status };
  }
  // RETRY: the server may accept it later. AUTH: the court session ran out; the queue
  // sends it again once the umpire has entered the PIN. Anything else (a 400) would be
  // refused the same way every time, so it is reported and not queued.
  if (kind === 'RETRY' || kind === 'AUTH' || !online()) {
    if (finalizeFrom) {
      await enqueueFinalize({ outbox, state, extra, from: finalizeFrom, matchId });
    } else {
      await enqueue(outbox, state, type, payload);
    }
  }
  return { failed: true, offline: !online(), status: result.status };
}

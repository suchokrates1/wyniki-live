import { FinishMatchRequest } from '../match-engine/models.js';
import { toFinishPayload, toMatchEventPayload, toMatchPayload, toStatisticsPayload } from '../match/matchPayload.js';
import { MutationType, classifyHttp } from './syncRules.js';

export async function syncMatchLive({
  api,
  outbox,
  reason,
  state,
  extra = null,
  online = () => globalThis.navigator?.onLine !== false,
}) {
  const payload = toMatchPayload(state);
  if (!online()) {
    if (reason === 'event') {
      await outbox.enqueue({
        clientMatchUuid: state.clientMatchUuid,
        type: MutationType.EVENT,
        payload: toMatchEventPayload(state, extra?.eventType || 'point'),
        serverMatchId: state.matchId,
      });
      return { failed: true, offline: true };
    }
    if (reason === 'finalize') {
      await outbox.enqueue({
        clientMatchUuid: state.clientMatchUuid,
        type: state.matchId == null ? MutationType.CREATE : MutationType.UPDATE,
        payload,
        serverMatchId: state.matchId,
      });
      await enqueueForRetry({
        outbox,
        reason,
        state,
        extra,
        type: MutationType.FINISH,
      });
      const stats = toStatisticsPayload(state);
      if (stats) {
        await outbox.enqueue({
          clientMatchUuid: state.clientMatchUuid,
          type: MutationType.STATS,
          payload: stats,
          serverMatchId: state.matchId,
        });
      }
    } else {
      await enqueueForRetry({
        outbox,
        reason,
        state,
        extra,
        type: state.matchId == null ? MutationType.CREATE : MutationType.UPDATE,
      });
    }
    return { failed: true, offline: true };
  }
  try {
    if (reason === 'event') {
      const payload = extra?.eventType
        ? toMatchEventPayload(state, extra.eventType)
        : toMatchEventPayload(state, 'point');
      const result = await api.logMatchEvent(payload);
      if (!result.ok) {
        return handleFailure({
          api,
          outbox,
          reason,
          state,
          extra: payload,
          result,
          online,
          type: MutationType.EVENT,
          payload,
        });
      }
      return { matchId: state.matchId };
    }

    if (reason === 'create' || state.matchId == null) {
      const result = await api.createMatch(payload);
      if (result.ok) return { matchId: result.data?.id };
      return handleFailure({ api, outbox, reason, state, extra, result, online, type: MutationType.CREATE, payload });
    }

    const update = await api.updateMatch(state.matchId, payload);
    if (!update.ok) {
      return handleFailure({
        api,
        outbox,
        reason,
        state,
        extra,
        result: update,
        online,
        type: MutationType.UPDATE,
        payload,
      });
    }

    if (reason === 'finalize') {
      const request = extra || new FinishMatchRequest({
        finishReason: state.finishReason,
        winnerName: state.finishWinnerName,
        injuredPlayerName: state.injuredPlayerName,
        resultNote: state.resultNote,
      });
      const finishPayload = toFinishPayload(request);
      const finish = await api.finishMatch(state.matchId, finishPayload);
      if (!finish.ok) {
        return handleFailure({
          api,
          outbox,
          reason: 'finalize',
          state,
          extra: finishPayload,
          result: finish,
          online,
          type: MutationType.FINISH,
          payload: finishPayload,
        });
      }
      const stats = toStatisticsPayload({ ...state, matchId: state.matchId });
      if (stats) {
        const sent = await api.sendStatistics(stats);
        if (!sent.ok) {
          await outbox.enqueue({
            clientMatchUuid: state.clientMatchUuid,
            type: MutationType.STATS,
            payload: stats,
            serverMatchId: state.matchId,
          });
        }
      }
    }
    return { matchId: state.matchId };
  } catch {
    await enqueueForRetry({
      outbox,
      reason,
      state,
      extra,
      type: reason === 'event'
        ? MutationType.EVENT
        : reason === 'finalize'
          ? MutationType.FINISH
          : (state.matchId == null ? MutationType.CREATE : MutationType.UPDATE),
    });
    return { failed: true, offline: !online() };
  }
}

async function handleFailure({ outbox, reason, state, extra, result, online, type, payload }) {
  const kind = classifyHttp(result.status);
  if (kind === 'DROP') {
    await outbox.dropPendingForMatch(state.clientMatchUuid);
    return { failed: true, status: result.status };
  }
  if (kind === 'RETRY' || !online()) {
    await outbox.enqueue({
      clientMatchUuid: state.clientMatchUuid,
      type,
      payload: extra && type === MutationType.FINISH ? extra : payload,
      serverMatchId: state.matchId,
    });
    if (reason === 'finalize' && type === MutationType.FINISH) {
      const stats = toStatisticsPayload(state);
      if (stats) {
        await outbox.enqueue({
          clientMatchUuid: state.clientMatchUuid,
          type: MutationType.STATS,
          payload: stats,
          serverMatchId: state.matchId,
        });
      }
    }
    return { failed: true, offline: !online(), status: result.status };
  }
  return { failed: true, offline: !online(), status: result.status };
}

async function enqueueForRetry({ outbox, reason, state, extra, type }) {
  const payload = type === MutationType.FINISH
    ? (extra || toFinishPayload(new FinishMatchRequest({
      finishReason: state.finishReason,
      winnerName: state.finishWinnerName,
      injuredPlayerName: state.injuredPlayerName,
      resultNote: state.resultNote,
    })))
    : type === MutationType.EVENT
      ? (extra?.eventType ? toMatchEventPayload(state, extra.eventType) : toMatchEventPayload(state, extra?.event_type || 'point'))
      : toMatchPayload(state);
  await outbox.enqueue({
    clientMatchUuid: state.clientMatchUuid,
    type,
    payload,
    serverMatchId: state.matchId,
  });
}

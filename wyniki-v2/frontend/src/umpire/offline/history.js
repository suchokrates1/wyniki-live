import { MatchFinishReason } from '../match-engine/models.js';
import { finishWinnerName } from '../match/matchPayload.js';

export function historyEntryFromState(state, nowMs = Date.now()) {
  if (!state || state.finishReason === MatchFinishReason.TEST) return null;
  return {
    clientMatchUuid: state.clientMatchUuid,
    matchId: state.matchId,
    courtId: state.courtId,
    courtName: state.courtName,
    player1Name: state.getTeam1DisplayName(),
    player2Name: state.getTeam2DisplayName(),
    player1Sets: state.player1Sets,
    player2Sets: state.player2Sets,
    setsHistory: (state.setsHistory || []).map((set) => ({ ...set })),
    duration: state.matchDuration,
    startTime: state.matchStartTime,
    endTime: nowMs,
    umpireName: state.umpireName,
    winnerName: finishWinnerName(state),
    finishReason: state.finishReason,
    player1Stats: { ...state.player1Stats },
    player2Stats: { ...state.player2Stats },
  };
}

export function createHistory({ table } = {}) {
  return {
    async save(entry) {
      if (!entry?.clientMatchUuid) return null;
      const existing = (await table.all()).find((row) => row.clientMatchUuid === entry.clientMatchUuid);
      return table.put({ id: existing?.id, ...entry });
    },

    async list() {
      return (await table.all()).sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    },

    async get(clientMatchUuid) {
      return (await table.all()).find((row) => row.clientMatchUuid === clientMatchUuid) || null;
    },

    async remove(clientMatchUuid) {
      const row = await this.get(clientMatchUuid);
      if (row?.id != null) await table.delete(row.id);
    },

    async clear() {
      await table.clear();
    },
  };
}

export function formatHistoryScore(entry) {
  return `${entry.player1Sets} : ${entry.player2Sets}`;
}

export function formatHistoryWhen(entry) {
  if (!entry.startTime) return '';
  const date = new Date(entry.startTime);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatHistoryDuration(entry) {
  const total = Math.max(0, Math.floor((entry.duration || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

import { parseExpiresAt } from '../session.js';
import { toDirectorSnapshot } from '../match/matchPayload.js';
import { SyncStatus } from '../match/matchViews.js';
import { APP_VERSION, createHeartbeat, heartbeatBody } from '../offline/heartbeat.js';
import { historyEntryFromState } from '../offline/history.js';
import { directorPollDelayMs } from '../offline/directorPollDelay.js';
import { syncMatchLive } from '../offline/matchSync.js';
import { createMatchSyncQueue } from '../offline/matchSyncQueue.js';
import { createOutboxDispatcher } from '../offline/outbox.js';
import { openUmpireStores } from '../offline/store.js';

export function createUmpireDirectorAndSyncSlice({ api, session }) {
  return {
    async initOffline() {
      const stores = await openUmpireStores();
      this._outbox = stores.outbox;
      this._history = stores.history;
      this._heartbeat = createHeartbeat({
        send: (body) => api.sendHeartbeat(body),
        getBody: () => this.heartbeatPayload(),
        canSend: () => !this.tutorialMode && Boolean(session.getCourtSession()?.token),
      });
      this._heartbeat.start();
      if (!this.tutorialMode) this.startDirectorPoll();
      if (navigator.onLine && !this.tutorialMode) this.flushOutbox();
    },

    heartbeatPayload() {
      const court = session.getCourtSession();
      const state = this.match?.state;
      const screen = this.screen === 'match'
        ? `Match:${this.matchView()}`
        : this.screen === 'historyDetail'
          ? 'MatchDetail'
          : this.screen === 'history'
            ? 'MatchHistory'
            : this.screen;
      const bat = this._battery.get();
      return heartbeatBody({
        courtId: court?.courtId || state?.courtId || '',
        screen,
        matchId: state?.matchId ?? null,
        clientMatchUuid: state?.clientMatchUuid || null,
        appVersion: APP_VERSION,
        batteryLevel: bat.level,
        isCharging: bat.charging,
        snapshot: state ? toDirectorSnapshot(state) : null,
      });
    },

    applyDirectorCommands(commands) {
      if (!commands?.length || !this.match) return;
      const applied = this.match.applyDirectorCommands(commands);
      if (!applied.length) return;
      const uuid = this.match.state?.clientMatchUuid;
      if (uuid && this._outbox?.dropPendingForMatch) {
        this._outbox.dropPendingForMatch(uuid);
      }
      for (const command of applied) {
        if (command.courtToken && command.courtId) {
          const current = session.getCourtSession() || {};
          session.saveCourtSession({
            ...current,
            courtId: command.courtId,
            courtName: command.courtName || command.courtId,
            token: command.courtToken,
            expiresAtMillis: parseExpiresAt(command.courtTokenExpiresAt) ?? current.expiresAtMillis,
          });
        }
        if (command.id) api.ackDirectorCommand(command.id, command.courtId || session.getCourtSession()?.courtId);
      }
      this.showDirectorToast();
    },

    showDirectorToast() {
      this.directorToast = true;
      clearTimeout(this._directorToastTimer);
      this._directorToastTimer = setTimeout(() => {
        this.directorToast = false;
      }, 2800);
    },

    startDirectorPoll() {
      if (this.tutorialMode || this._pollActive) return;
      this._pollActive = true;
      const poll = async () => {
        let failures = 0;
        while (this._pollActive) {
          if (this.tutorialMode) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          const court = session.getCourtSession();
          if (!court?.courtId || !navigator.onLine) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          try {
            const state = this.match?.state;
            const result = await api.getDirectorCommands({
              courtId: court.courtId,
              matchId: state?.matchId,
              clientMatchUuid: state?.clientMatchUuid,
              waitMs: 20_000,
            });
            if (result?.ok) {
              failures = 0;
              this.applyDirectorCommands(result.data?.commands);
              continue;
            }
            failures += 1;
            await new Promise((resolve) => setTimeout(resolve, directorPollDelayMs(result?.status, failures)));
          } catch {
            failures += 1;
            await new Promise((resolve) => setTimeout(resolve, directorPollDelayMs(0, failures)));
          }
        }
      };
      poll();
    },

    async persistHistory(state) {
      if (this.tutorialMode) return;
      const entry = historyEntryFromState(state);
      if (entry && this._history) await this._history.save(entry);
    },

    async flushOutbox() {
      if (this.tutorialMode) return;
      if (!this._outbox) return;
      const result = await this._outbox.flush(createOutboxDispatcher(api));
      if (result.dropped || result.failed) {
        this._diagnostics.record(result.dropped ? 'FAILED' : 'OFFLINE', result.dropped ? 'HTTP 403' : '');
        this.match?.setSyncStatus(result.dropped ? SyncStatus.FAILED : SyncStatus.OFFLINE);
      } else if (result.flushed) {
        this._diagnostics.record('SYNCED');
        this.match?.setSyncStatus(SyncStatus.SYNCED);
      }
    },

    recordSyncDiagnostics(result) {
      if (result?.offline) this._diagnostics.record('OFFLINE', result.status ? `HTTP ${result.status}` : '');
      else if (result?.failed) this._diagnostics.record('FAILED', result.status ? `HTTP ${result.status}` : '');
      else this._diagnostics.record('SYNCED');
    },

    syncMatch(reason, state, extra) {
      if (this.tutorialMode) return Promise.resolve({ failed: false });
      this._syncQueue ||= createMatchSyncQueue((r, snap, ex) => this.runQueuedSync(r, snap, ex));
      return this._syncQueue.enqueue(reason, state, extra);
    },

    async runQueuedSync(reason, state, extra) {
      if (reason === 'finalize') {
        try {
          await this.persistHistory(state);
        } catch (error) {
          console.error('Umpire history save failed:', error);
        }
      }
      if (!this._outbox) {
        return { failed: true, offline: !navigator.onLine };
      }
      const result = await syncMatchLive({
        api,
        outbox: this._outbox,
        reason,
        state,
        extra,
        online: () => navigator.onLine,
      });
      this.recordSyncDiagnostics(result);
      return result;
    },
  };
}

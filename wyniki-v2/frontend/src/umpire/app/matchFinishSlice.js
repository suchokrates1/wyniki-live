import { DEFAULT_MATCH_CONFIG_FORM } from '../matchConfigForm.js';
import { FinishMatchRequest, MatchFinishReason } from '../match-engine/models.js';
import {
  finalSetBySetLine,
  finalSetsLine,
  finishStatRows,
  finishStatValue,
} from '../match/finishView.js';
import { finishWinnerName } from '../match/matchPayload.js';
import { emptyMotionUi } from '../match/matchMotion.js';
import { formFromLastConfig } from './playersAndConfigSlice.js';

export function createUmpireMatchFinishSlice({ session, wakeLock }) {
  return {
    askUndo() {
      if (!this.chrome().undoEnabled) return;
      if (this.tutorialMode) {
        this.match?.undoLastAction();
        this.tutorialNote('undo');
        return;
      }
      this.dialog = 'undo';
    },

    confirmUndo() {
      this.dialog = null;
      this.match?.undoLastAction();
      this.tutorialNote('undo');
    },

    askFinish() {
      if (!this.chrome().showFinish) return;
      this.finishStep = 'reason';
      this.dialog = 'finish';
      this.tutorialNote('openFinish');
    },

    pickFinishReason(reason) {
      if (this.tutorialMode && reason === MatchFinishReason.RETIREMENT) {
        this.finishStep = 'retirement';
        this.tutorialNote('openFinish');
        return;
      }
      if (reason === MatchFinishReason.RETIREMENT) {
        this.finishStep = 'retirement';
        return;
      }
      if (reason === MatchFinishReason.WALKOVER) {
        this.finishStep = 'walkover';
        return;
      }
      this.confirmFinish(new FinishMatchRequest({ finishReason: reason }));
    },

    pickRetirement(injuredIsTeam1) {
      this.tutorialNote('pickRetirement');
      const state = this.match.state;
      this.confirmFinish(new FinishMatchRequest({
        finishReason: MatchFinishReason.RETIREMENT,
        injuredPlayerName: injuredIsTeam1 ? state.getTeam1FullName() : state.getTeam2FullName(),
        winnerName: injuredIsTeam1 ? state.getTeam2FullName() : state.getTeam1FullName(),
      }));
    },

    pickWalkover(winnerIsTeam1) {
      const state = this.match.state;
      this.confirmFinish(new FinishMatchRequest({
        finishReason: MatchFinishReason.WALKOVER,
        winnerName: winnerIsTeam1 ? state.getTeam1FullName() : state.getTeam2FullName(),
      }));
    },

    confirmFinish(request) {
      this.dialog = null;
      this.finishStep = null;
      this.match.finishMatchWithOutcome(request);
      wakeLock.release();
    },

    winnerName() {
      this.matchRev;
      return this.match?.state ? finishWinnerName(this.match.state) : '';
    },

    finalSets() {
      this.matchRev;
      return this.match?.state ? finalSetsLine(this.match.state) : '';
    },

    finalSetBySet() {
      this.matchRev;
      return this.match?.state ? finalSetBySetLine(this.match.state) : '';
    },

    finishStats() {
      this.matchRev;
      return this.match?.state ? finishStatRows(this.match.state) : [];
    },

    finishStatText(row) {
      this.matchRev;
      return this.match?.state ? finishStatValue(this.match.state, row) : '';
    },

    gameModeLabel() {
      const board = this.scoreboard();
      if (!board?.gameMode) return '';
      return board.gameMode === 'super_tiebreak'
        ? this.t('superTiebreakMode', { points: board.gameModePoints })
        : this.t('tiebreakMode', { points: board.gameModePoints });
    },

    statsLine(field) {
      this.matchRev;
      const state = this.match?.state;
      if (!state) return '';
      return `${state.player1Stats[field]} / ${state.player2Stats[field]}`;
    },

    servePctLine() {
      this.matchRev;
      const state = this.match?.state;
      if (!state) return '';
      return `${state.player1Stats.getFirstServePercentage()}% / ${state.player2Stats.getFirstServePercentage()}%`;
    },

    /** Whether the screen is kept on (the iPad check reads it). */
    wakeLockHeld() {
      return wakeLock.active;
    },

    nextMatch(sameSetup) {
      if (this.tutorialMode) {
        this.exitTutorial();
        return;
      }
      wakeLock.release();
      session.clearActiveMatch();
      this.motion = emptyMotionUi();
      this._motionPrev = null;
      this._lastAnnouncement = null;
      this.selectedIds = [];
      this.team1Name = null;
      this.team2Name = null;
      this.selectedScheduleId = null;
      this.suggestion = null;
      this.configForm = sameSetup
        ? formFromLastConfig(session.getLastMatchConfig())
        : { ...DEFAULT_MATCH_CONFIG_FORM };
      if (!sameSetup) session.clearLastMatchConfig();
      this.go('players');
    },
  };
}

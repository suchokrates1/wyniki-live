import { announcementContent } from '../match/announcementView.js';
import { buildAdvancedRally, buildAdvancedServe } from '../match/advancedScoringView.js';
import { buildBasicScoring } from '../match/basicScoringView.js';
import { MatchView } from '../match/matchViews.js';
import {
  MOTION_MS,
  motionPatches,
  panelVisible,
  snapshotMatchMotion,
} from '../match/matchMotion.js';
import { buildScoreboard } from '../match/scoreboardView.js';
import { buildServerButtons, resolveServerNumber } from '../match/serverSelection.js';

export function createUmpireMatchScreenSlice({ wakeLock }) {
  return {
    bracketNotice() {
      const type = this.match?.bracketWarning;
      if (type === 'different_groups') {
        return {
          title: this.t('bracketWarningTitle'),
          message: this.t('bracketWarningDifferentGroups'),
        };
      }
      if (type === 'no_bracket') {
        return {
          title: this.t('bracketWarningTitle'),
          message: this.t('bracketWarningFriendly'),
        };
      }
      return null;
    },

    dismissBracketNotice() {
      this.match?.clearBracketWarning?.();
    },

    matchView() {
      this.matchRev;
      return this.match?.view || MatchView.SERVER_SELECTION;
    },

    matchState() {
      this.matchRev;
      return this.match?.state || null;
    },

    chrome() {
      this.matchRev;
      return this.match?.chrome() || {
        showScoreboard: false,
        showUndo: false,
        showFinish: false,
        undoEnabled: false,
        confirmLeave: false,
        showTimer: false,
      };
    },

    scoreboard() {
      this.matchRev;
      return this.match?.state ? buildScoreboard(this.match.state) : null;
    },

    serverButtons() {
      this.matchRev;
      return this.match?.state ? buildServerButtons(this.match.state).filter((button) => button.visible) : [];
    },

    basicView() {
      this.matchRev;
      return this.match?.state ? buildBasicScoring(this.match.state) : null;
    },

    announcement() {
      this.matchRev;
      if (!this.match?.state) return this.motion.leavingView === MatchView.ANNOUNCEMENT ? this._lastAnnouncement : null;
      const content = announcementContent(this.match.pendingAnnouncementType, this.match.state, (key, vars) => this.t(key, vars));
      if (content) this._lastAnnouncement = content;
      if (!content && this.motion.leavingView === MatchView.ANNOUNCEMENT) return this._lastAnnouncement;
      return content;
    },

    syncLabel() {
      this.matchRev;
      const status = this.match?.syncStatus || 'IDLE';
      return this.t({
        IDLE: 'syncIdle',
        SYNCING: 'syncSyncing',
        SYNCED: 'syncSynced',
        FAILED: 'syncFailed',
        OFFLINE: 'syncOffline',
      }[status] || 'syncIdle');
    },

    chooseServer(buttonIndex) {
      if (this.tutorialMode) {
        this.tutorialNote('chooseServer');
        return;
      }
      const state = this.match?.state;
      if (!state) return;
      this.match.setFirstServer(resolveServerNumber(buttonIndex, state));
      wakeLock.request();
    },

    swapSides() {
      this.tutorialNote('swapSides');
      if (this.motion.sideSwapPhase) return;
      this.motion.sideSwapPhase = 'out';
      this.clearMotionTimer('sideOut');
      this._motionTimers.sideOut = setTimeout(() => {
        this.match?.swapSides();
        this.motion.sideSwapPhase = 'in';
        this.clearMotionTimer('sideIn');
        this._motionTimers.sideIn = setTimeout(() => {
          this.motion.sideSwapPhase = '';
        }, MOTION_MS.sideSwap);
      }, MOTION_MS.sideSwap);
    },

    clearMotionTimer(name) {
      if (this._motionTimers[name]) {
        clearTimeout(this._motionTimers[name]);
        this._motionTimers[name] = null;
      }
    },

    flagMotion(name, duration) {
      this.motion[name] = false;
      const apply = () => {
        this.motion[name] = true;
        this.clearMotionTimer(name);
        this._motionTimers[name] = setTimeout(() => {
          this.motion[name] = false;
        }, duration);
      };
      if (this.$nextTick) this.$nextTick(apply);
      else queueMicrotask(apply);
    },

    applyMotion() {
      const next = snapshotMatchMotion(this.match?.state, this.matchView());
      const patch = motionPatches(this._motionPrev, next);
      this._motionPrev = next;

      if (Object.prototype.hasOwnProperty.call(patch, 'leavingView')
        || Object.prototype.hasOwnProperty.call(patch, 'enteringView')) {
        this.motion.leavingView = patch.leavingView || null;
        this.motion.enteringView = patch.enteringView || null;
        this.clearMotionTimer('leave');
        this.clearMotionTimer('enter');
        this._motionTimers.leave = setTimeout(() => {
          this.motion.leavingView = null;
        }, MOTION_MS.panelExit);
        this._motionTimers.enter = setTimeout(() => {
          this.motion.enteringView = null;
        }, MOTION_MS.panelEnter);
      }

      const pulses = ['pulseP1', 'pulseP2', 'pulseSet1P1', 'pulseSet1P2', 'pulseSet2P1', 'pulseSet2P2'];
      for (const key of pulses) {
        if (patch[key]) this.flagMotion(key, MOTION_MS.pulse);
      }
      const serveFlags = ['serveLeaveP1', 'serveLeaveP2', 'serveEnterP1', 'serveEnterP2'];
      for (const key of serveFlags) {
        if (patch[key]) this.flagMotion(key, MOTION_MS.serveIcon);
      }
      if (patch.cardSwap) this.flagMotion('cardSwap', MOTION_MS.cardSwap);
      if (patch.secondServe) this.flagMotion('secondServe', MOTION_MS.secondServe);
      if (patch.secondServeAdvanced) this.flagMotion('secondServeAdvanced', MOTION_MS.secondServeFade);
    },

    panelVisible(name) {
      return panelVisible(this.matchView(), this.motion.leavingView, name);
    },

    panelClass(name) {
      return {
        'is-shown': this.panelVisible(name),
        'is-enter': this.motion.enteringView === name,
        'is-exit': this.motion.leavingView === name,
      };
    },

    basicWin(isPlayer1) {
      this.match?.handleBasicWin(isPlayer1);
      this.tutorialNote('awardPoint');
    },

    basicFault() {
      const kind = this.basicView()?.faultKind;
      this.match?.handleBasicFault();
      this.tutorialNote(kind === 'double' ? 'doubleFault' : 'secondServe');
    },

    advancedServe() {
      this.matchRev;
      return this.match?.state ? buildAdvancedServe(this.match.state) : null;
    },

    advancedRally() {
      this.matchRev;
      return this.match?.state ? buildAdvancedRally(this.match.state) : null;
    },

    ace() {
      this.match?.handleAce();
    },

    fault() {
      this.match?.handleFault();
    },

    footFault() {
      this.match?.handleFootFault();
    },

    ballInPlay() {
      this.match?.handleBallInPlay();
    },

    winner(isPlayer1) {
      this.match?.handleWinner(isPlayer1);
    },

    forcedError(isPlayer1) {
      this.match?.handleForcedError(isPlayer1);
    },

    unforcedError(isPlayer1) {
      this.match?.handleUnforcedError(isPlayer1);
    },

    continueAnnouncement() {
      this.match?.continueFromAnnouncement();
    },

    skipSideChange() {
      this.match?.skipSideChange();
    },
  };
}

import { MatchActionReducer, MatchCommand } from '../match-engine/matchActionReducer.js';
import { MatchFinishOutcomeApplier } from '../match-engine/matchFinishOutcomeApplier.js';
import { MatchProgressReducer, MatchProgressScreen } from '../match-engine/matchProgressReducer.js';
import { MatchUndoManager, MatchUndoResult } from '../match-engine/matchUndoManager.js';
import { ActionType } from '../match-engine/models.js';
import { MatchView, SyncStatus, matchChrome } from './matchViews.js';

export function createMatchController({
  now = () => Date.now(),
  onChange = () => {},
  onSync = null,
} = {}) {
  let state = null;
  let view = MatchView.SERVER_SELECTION;
  let canUndo = false;
  let undoMessage = null;
  let pendingAnnouncementType = null;
  let syncStatus = SyncStatus.IDLE;

  function notify() {
    onChange();
  }

  function scoringView() {
    return MatchView.BASIC_SCORING;
  }

  function serverName() {
    if (!state) return '';
    if (state.isDoubles) return state.getCurrentServerName();
    return state.isPlayer1Serving
      ? state.player1.getDisplayName()
      : state.player2.getDisplayName();
  }

  function playerName(isPlayer1) {
    return isPlayer1 ? state.player1.getDisplayName() : state.player2.getDisplayName();
  }

  function saveBefore(actionType, description) {
    MatchUndoManager.saveStateBeforeAction(state, actionType, description);
    canUndo = true;
  }

  function handlePointResult(result) {
    if (result.announcementType) pendingAnnouncementType = result.announcementType;
    if (result.showAnnouncementImmediately) {
      view = MatchView.ANNOUNCEMENT;
    }
  }

  function applyMatchCommand(command) {
    const result = MatchActionReducer.reduce(state, command);
    if (result.pointWinner != null) {
      const pointResult = MatchActionReducer.reduce(
        state,
        MatchCommand.PointWon(result.pointWinner),
      );
      handlePointResult(pointResult);
    }
    handlePointResult(result);
    if (result.pointWinner != null || result.pointScored) {
      checkGameAndSetStatus();
    }
  }

  function checkGameAndSetStatus() {
    const result = MatchProgressReducer.reduceAfterPoint(
      state,
      pendingAnnouncementType,
      now(),
    );
    pendingAnnouncementType = result.announcementType;
    if (result.finalizeMatch) requestSync('finalize');
    view = result.nextScreen === MatchProgressScreen.Announcement
      ? MatchView.ANNOUNCEMENT
      : result.nextScreen === MatchProgressScreen.MatchFinished
        ? MatchView.MATCH_FINISHED
        : scoringView();
    if (result.syncMatch) requestSync('update');
  }

  function requestSync(reason, extra = null) {
    if (!onSync || !state) return;
    syncStatus = SyncStatus.SYNCING;
    Promise.resolve(onSync(reason, state, extra))
      .then((result) => {
        if (result?.matchId != null) state.matchId = result.matchId;
        syncStatus = result?.offline ? SyncStatus.OFFLINE : SyncStatus.SYNCED;
        if (result?.failed) syncStatus = SyncStatus.FAILED;
        notify();
      })
      .catch(() => {
        syncStatus = navigatorOnLine() ? SyncStatus.FAILED : SyncStatus.OFFLINE;
        notify();
      });
  }

  function navigatorOnLine() {
    return globalThis.navigator?.onLine !== false;
  }

  return {
    get state() {
      return state;
    },
    get view() {
      return view;
    },
    get canUndo() {
      return canUndo;
    },
    get undoMessage() {
      return undoMessage;
    },
    get pendingAnnouncementType() {
      return pendingAnnouncementType;
    },
    get syncStatus() {
      return syncStatus;
    },
    chrome() {
      return matchChrome(state, view, canUndo);
    },

    initialize(nextState, options = {}) {
      state = nextState;
      view = options.view || MatchView.SERVER_SELECTION;
      canUndo = Boolean(nextState?.actionsHistory?.length);
      pendingAnnouncementType = options.pendingAnnouncementType ?? null;
      undoMessage = null;
      syncStatus = SyncStatus.IDLE;
      notify();
    },

    setFirstServer(serverNumber) {
      if (!state) return;
      applyMatchCommand(MatchCommand.StartMatch(serverNumber, now()));
      view = scoringView();
      requestSync('create');
      notify();
    },

    swapSides() {
      if (!state) return;
      applyMatchCommand(MatchCommand.ToggleSides);
      notify();
    },

    handleBasicWin(isPlayer1) {
      if (!state || state.isMatchFinished) return;
      saveBefore(ActionType.WINNER, `Win - ${playerName(isPlayer1)}`);
      applyMatchCommand(MatchCommand.BasicWin(isPlayer1));
      notify();
    },

    handleBasicFault() {
      if (!state || state.isMatchFinished) return;
      if (state.isFirstServe) {
        saveBefore(ActionType.FAULT, '1st serve fault');
      } else {
        saveBefore(ActionType.DOUBLE_FAULT, `Double fault - ${serverName()}`);
      }
      applyMatchCommand(MatchCommand.BasicFault);
      notify();
    },

    continueFromAnnouncement() {
      pendingAnnouncementType = null;
      if (!state) return;
      view = scoringView();
      notify();
    },

    skipSideChange() {
      if (!state) return;
      applyMatchCommand(MatchCommand.ToggleSides);
      pendingAnnouncementType = null;
      view = scoringView();
      notify();
    },

    undoLastAction() {
      if (!state) return;
      const result = MatchUndoManager.undoLastAction(state);
      if (result === MatchUndoResult.NoAction || result.type === 'NoAction') {
        undoMessage = 'none';
        notify();
        return;
      }
      canUndo = result.canUndo;
      undoMessage = result.description;
      pendingAnnouncementType = null;
      view = scoringView();
      notify();
    },

    clearUndoMessage() {
      undoMessage = null;
    },

    finishMatchWithOutcome(request) {
      if (!state) return;
      MatchFinishOutcomeApplier.apply(state, request, now());
      view = MatchView.MATCH_FINISHED;
      requestSync('finalize', request);
      notify();
    },

    restoreSnapshot({ state: nextState, view: nextView, pendingAnnouncementType: pending, canUndo: nextCanUndo }) {
      this.initialize(nextState, { view: nextView, pendingAnnouncementType: pending });
      canUndo = Boolean(nextCanUndo);
      notify();
    },
  };
}

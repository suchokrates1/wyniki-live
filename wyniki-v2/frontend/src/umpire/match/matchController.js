import { DirectorCommandApplier } from '../match-engine/directorCommandApplier.js';
import { MatchActionReducer, MatchCommand } from '../match-engine/matchActionReducer.js';
import { MatchFinishOutcomeApplier } from '../match-engine/matchFinishOutcomeApplier.js';
import { MatchProgressEvent, MatchProgressReducer, MatchProgressScreen } from '../match-engine/matchProgressReducer.js';
import { MatchPointEvent } from '../match-engine/matchPointReducer.js';
import { MatchUndoManager, MatchUndoResult } from '../match-engine/matchUndoManager.js';
import { ActionType, StatsMode } from '../match-engine/models.js';
import { parseDirectorCommand } from '../offline/directorCommandParse.js';
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
  let bracketWarning = null;

  function notify() {
    onChange();
  }

  function scoringView() {
    return state?.statsMode === StatsMode.ADVANCED
      ? MatchView.SERVE
      : MatchView.BASIC_SCORING;
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
    for (const event of result.pointEvents || []) {
      if (event === MatchPointEvent.Point) requestSync('event', { eventType: 'point' });
      if (event === MatchPointEvent.ServeChange) requestSync('event', { eventType: 'serve_change' });
      if (event === MatchPointEvent.SideChange) requestSync('event', { eventType: 'side_change' });
    }
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
    if (result.transitionToRally) {
      view = MatchView.RALLY;
    }
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
    for (const event of result.events || []) {
      if (event === MatchProgressEvent.Game) requestSync('event', { eventType: 'game' });
      if (event === MatchProgressEvent.Set) requestSync('event', { eventType: 'set' });
    }
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
        if (result?.bracketWarning) bracketWarning = result.bracketWarning;
        if (result?.offline) syncStatus = SyncStatus.OFFLINE;
        else if (result?.failed) syncStatus = SyncStatus.FAILED;
        else syncStatus = SyncStatus.SYNCED;
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
    get bracketWarning() {
      return bracketWarning;
    },
    clearBracketWarning() {
      bracketWarning = null;
      notify();
    },
    setSyncStatus(next) {
      syncStatus = next;
      notify();
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
      bracketWarning = null;
      notify();
    },

    setFirstServer(serverNumber) {
      if (!state) return;
      applyMatchCommand(MatchCommand.StartMatch(serverNumber, now()));
      view = scoringView();
      requestSync('create');
      requestSync('event', { eventType: 'match_start' });
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

    handleAce() {
      if (!state || state.isMatchFinished) return;
      saveBefore(ActionType.ACE, `Ace - ${serverName()}`);
      applyMatchCommand(MatchCommand.Ace);
      notify();
    },

    handleFault() {
      if (!state || state.isMatchFinished) return;
      if (state.isFirstServe) {
        saveBefore(ActionType.FAULT, '1st serve fault');
      } else {
        saveBefore(ActionType.DOUBLE_FAULT, `Double fault - ${serverName()}`);
      }
      applyMatchCommand(MatchCommand.Fault);
      notify();
    },

    handleFootFault() {
      if (!state || state.isMatchFinished) return;
      if (state.isFirstServe) {
        saveBefore(ActionType.FOOT_FAULT, '1st serve foot fault');
      } else {
        saveBefore(ActionType.FOOT_FAULT, `Foot fault DF - ${serverName()}`);
      }
      applyMatchCommand(MatchCommand.FootFault);
      notify();
    },

    handleBallInPlay() {
      if (!state || state.isMatchFinished) return;
      applyMatchCommand(MatchCommand.BallInPlay);
      notify();
    },

    handleWinner(isPlayer1) {
      if (!state || state.isMatchFinished) return;
      saveBefore(ActionType.WINNER, `Winner - ${playerName(isPlayer1)}`);
      applyMatchCommand(MatchCommand.Winner(isPlayer1));
      notify();
    },

    handleForcedError(isPlayer1) {
      if (!state || state.isMatchFinished) return;
      saveBefore(ActionType.FORCED_ERROR, `Forced error - ${playerName(isPlayer1)}`);
      applyMatchCommand(MatchCommand.ForcedError(isPlayer1));
      notify();
    },

    handleUnforcedError(isPlayer1) {
      if (!state || state.isMatchFinished) return;
      saveBefore(ActionType.UNFORCED_ERROR, `Unforced error - ${playerName(isPlayer1)}`);
      applyMatchCommand(MatchCommand.UnforcedError(isPlayer1));
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

    applyDirectorCommands(commands = []) {
      const applied = [];
      if (!state) return applied;
      for (const raw of commands) {
        const command = parseDirectorCommand(raw);
        if (!DirectorCommandApplier.appliesTo(state, command)) continue;
        state = DirectorCommandApplier.apply(state, command);
        applied.push(command);
      }
      if (applied.length) notify();
      return applied;
    },

    restoreSnapshot({ state: nextState, view: nextView, pendingAnnouncementType: pending, canUndo: nextCanUndo }) {
      this.initialize(nextState, { view: nextView, pendingAnnouncementType: pending });
      canUndo = Boolean(nextCanUndo);
      notify();
    },
  };
}

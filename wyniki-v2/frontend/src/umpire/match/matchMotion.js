import { isServerOnLeft } from './basicScoringView.js';
import { MatchView } from './matchViews.js';
import { buildScoreboard } from './scoreboardView.js';

export const MOTION_MS = Object.freeze({
  panelEnter: 300,
  panelExit: 200,
  pulse: 300,
  setHighlightIn: 300,
  setHighlightOut: 200,
  sideSwap: 150,
  cardSwap: 300,
  serveIcon: 280,
  secondServe: 450,
  secondServeFade: 300,
  secondServeFlash: 600,
});

const SCORING_VIEWS = new Set([
  MatchView.SERVE,
  MatchView.RALLY,
  MatchView.BASIC_SCORING,
]);

export function emptyMotionUi() {
  return {
    leavingView: null,
    enteringView: null,
    pulseP1: false,
    pulseP2: false,
    pulseSet1P1: false,
    pulseSet1P2: false,
    pulseSet2P1: false,
    pulseSet2P2: false,
    serveLeaveP1: false,
    serveLeaveP2: false,
    serveEnterP1: false,
    serveEnterP2: false,
    cardSwap: false,
    sideSwapPhase: '',
    secondServe: false,
    secondServeAdvanced: false,
  };
}

export function snapshotMatchMotion(state, view) {
  const board = state ? buildScoreboard(state) : null;
  return {
    view: view || MatchView.SERVER_SELECTION,
    p1Points: board?.p1Points ?? '',
    p2Points: board?.p2Points ?? '',
    set1p1: board?.set1.p1 ?? '',
    set1p2: board?.set1.p2 ?? '',
    set2p1: board?.set2.p1 ?? '',
    set2p2: board?.set2.p2 ?? '',
    p1Serving: Boolean(board?.p1Serving),
    p2Serving: Boolean(board?.p2Serving),
    serverOnLeft: state ? isServerOnLeft(state) : true,
    isFirstServe: Boolean(state?.isFirstServe),
    doubles: Boolean(state?.isDoubles),
  };
}

export function motionPatches(prev, next) {
  if (!prev) {
    return {
      enteringView: next.view,
      leavingView: null,
    };
  }

  const patch = {};
  if (prev.view !== next.view) {
    patch.leavingView = prev.view;
    patch.enteringView = next.view;
  }
  if (prev.p1Points !== next.p1Points) patch.pulseP1 = true;
  if (prev.p2Points !== next.p2Points) patch.pulseP2 = true;
  if (prev.set1p1 !== next.set1p1) patch.pulseSet1P1 = true;
  if (prev.set1p2 !== next.set1p2) patch.pulseSet1P2 = true;
  if (prev.set2p1 !== next.set2p1) patch.pulseSet2P1 = true;
  if (prev.set2p2 !== next.set2p2) patch.pulseSet2P2 = true;

  if (!next.doubles && prev.p1Serving !== next.p1Serving) {
    if (next.p1Serving) {
      patch.serveLeaveP2 = true;
      patch.serveEnterP1 = true;
    } else {
      patch.serveLeaveP1 = true;
      patch.serveEnterP2 = true;
    }
  }

  if (prev.serverOnLeft !== next.serverOnLeft && SCORING_VIEWS.has(next.view)) {
    patch.cardSwap = true;
  }

  if (prev.isFirstServe && !next.isFirstServe) {
    if (next.view === MatchView.BASIC_SCORING) patch.secondServe = true;
    if (next.view === MatchView.SERVE) patch.secondServeAdvanced = true;
  }

  return patch;
}

export function panelVisible(currentView, leavingView, name) {
  return currentView === name || leavingView === name;
}

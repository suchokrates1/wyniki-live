import basic from './snapshots/basic.json' with { type: 'json' };
import doubleFault from './snapshots/double-fault.json' with { type: 'json' };
import finished from './snapshots/finished.json' with { type: 'json' };
import serve from './snapshots/serve.json' with { type: 'json' };
import setBreak from './snapshots/set-break.json' with { type: 'json' };
import sideChange from './snapshots/side-change.json' with { type: 'json' };
import tiebreak from './snapshots/tiebreak.json' with { type: 'json' };
import undo from './snapshots/undo.json' with { type: 'json' };
import { overlayTutorialPlayers } from './catalog.js';
import { hydrateMatchState } from '../match/matchStateIo.js';

const SNAPSHOTS = Object.freeze({
  serve,
  basic,
  'double-fault': doubleFault,
  'side-change': sideChange,
  'set-break': setBreak,
  tiebreak,
  undo,
  finished,
});

export function loadTutorialSnapshot(id, t) {
  const raw = SNAPSHOTS[id];
  if (!raw?.state) return null;
  const state = overlayTutorialPlayers(hydrateMatchState(raw.state), t);
  return {
    id: raw.id,
    view: raw.view,
    pendingAnnouncementType: raw.pendingAnnouncementType,
    canUndo: raw.canUndo,
    state,
  };
}

export function tutorialSnapshotIds() {
  return Object.keys(SNAPSHOTS);
}

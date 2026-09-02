import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchActionReducer, MatchCommand } from '../src/umpire/match-engine/matchActionReducer.js';
import { MatchFinishOutcomeApplier } from '../src/umpire/match-engine/matchFinishOutcomeApplier.js';
import { FinishMatchRequest, MatchConfig, MatchFinishReason, StatsMode } from '../src/umpire/match-engine/models.js';
import { Player } from '../src/umpire/match-engine/player.js';
import { playStraightGame, scorePoint } from '../src/umpire/match-engine/playPoint.js';
import { matchState } from '../src/umpire/match-engine/testSupport.js';
import { serializeMatchState } from '../src/umpire/match/matchStateIo.js';
import { MatchView } from '../src/umpire/match/matchViews.js';

const outDir = fileURLToPath(new URL('../src/umpire/tutorial/snapshots/', import.meta.url));
const START = 1_700_000_000_000;

function demoPlayers() {
  return {
    player1: new Player({
      id: 9001,
      name: 'Anna Costa',
      firstName: 'Anna',
      lastName: 'Costa',
      flag: 'IT',
      gender: 'F',
    }),
    player2: new Player({
      id: 9002,
      name: 'Piotr Nowak',
      firstName: 'Piotr',
      lastName: 'Nowak',
      flag: 'PL',
      gender: 'M',
    }),
  };
}

function freshState() {
  return matchState({
    clientMatchUuid: 'tutorial-demo-match',
    courtId: 'tutorial-1',
    courtName: 'Court 1',
    matchConfig: new MatchConfig({
      gamesPerSet: 4,
      setsToWin: 2,
      statsMode: StatsMode.BASIC,
    }),
    statsMode: StatsMode.BASIC,
    ...demoPlayers(),
  });
}

function start(state, now = START) {
  MatchActionReducer.reduce(state, MatchCommand.StartMatch(1, now));
}

function dump(id, state, view, pendingAnnouncementType, canUndo) {
  return {
    id,
    view,
    pendingAnnouncementType,
    canUndo: Boolean(canUndo),
    state: serializeMatchState(state),
  };
}

function serveSnapshot() {
  const state = freshState();
  return dump('serve', state, MatchView.SERVER_SELECTION, null, false);
}

function basicSnapshot() {
  const state = freshState();
  start(state);
  scorePoint(state, true, START + 1_000, { saveUndo: true });
  scorePoint(state, true, START + 2_000, { saveUndo: true });
  scorePoint(state, false, START + 3_000, { saveUndo: true });
  return dump('basic', state, MatchView.BASIC_SCORING, null, true);
}

function doubleFaultSnapshot() {
  const state = freshState();
  start(state);
  MatchActionReducer.reduce(state, MatchCommand.BasicFault);
  return dump('double-fault', state, MatchView.BASIC_SCORING, null, false);
}

function sideChangeSnapshot() {
  const state = freshState();
  start(state);
  const result = playStraightGame(state, true, START + 4_000);
  return dump('side-change', state, MatchView.ANNOUNCEMENT, result.announcementType, false);
}

function setBreakSnapshot() {
  const state = freshState();
  start(state);
  let result;
  for (let game = 0; game < 4; game += 1) {
    result = playStraightGame(state, true, START + 10_000 + game * 100);
  }
  return dump('set-break', state, MatchView.ANNOUNCEMENT, result.announcementType, false);
}

function tiebreakSnapshot() {
  const state = freshState();
  start(state);
  let result;
  for (let game = 0; game < 8; game += 1) {
    result = playStraightGame(state, game % 2 === 0, START + 20_000 + game * 100);
  }
  return dump('tiebreak', state, MatchView.ANNOUNCEMENT, result.announcementType, false);
}

function undoSnapshot() {
  const state = freshState();
  start(state);
  scorePoint(state, true, START + 1_000, { saveUndo: true });
  scorePoint(state, true, START + 2_000, { saveUndo: true });
  return dump('undo', state, MatchView.BASIC_SCORING, null, true);
}

function finishedSnapshot() {
  const state = freshState();
  start(state);
  scorePoint(state, true, START + 1_000, { saveUndo: true });
  MatchFinishOutcomeApplier.apply(state, new FinishMatchRequest({
    finishReason: MatchFinishReason.TEST,
    winnerName: state.getTeam1FullName(),
    injuredPlayerName: state.getTeam2FullName(),
    resultNote: 'tutorial',
  }), START + 50_000);
  return dump('finished', state, MatchView.MATCH_FINISHED, null, false);
}

const snapshots = [
  serveSnapshot(),
  basicSnapshot(),
  doubleFaultSnapshot(),
  sideChangeSnapshot(),
  setBreakSnapshot(),
  tiebreakSnapshot(),
  undoSnapshot(),
  finishedSnapshot(),
];

await mkdir(outDir, { recursive: true });
for (const item of snapshots) {
  const file = path.join(outDir, `${item.id}.json`);
  await writeFile(file, `${JSON.stringify(item, null, 2)}\n`);
  console.log(item.id, item.view, item.pendingAnnouncementType, `p1 ${item.state.player1Points}-${item.state.player2Points} g ${item.state.player1Games}-${item.state.player2Games} s ${item.state.player1Sets}-${item.state.player2Sets}`);
}

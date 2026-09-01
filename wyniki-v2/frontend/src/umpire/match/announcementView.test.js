import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig } from '../match-engine/models.js';
import { MatchProgressReducer } from '../match-engine/matchProgressReducer.js';
import { matchState } from '../match-engine/testSupport.js';
import { announcementContent } from './announcementView.js';

function t(key, vars = {}) {
  return `${key}:${JSON.stringify(vars)}`;
}

test('side change is the only announcement with skip', () => {
  const state = matchState();
  const side = announcementContent(MatchProgressReducer.ANNOUNCEMENT_SIDE_CHANGE, state, t);
  assert.equal(side.showSkipSides, true);
  assert.equal(side.title.startsWith('announceSideChange'), true);

  const tb = announcementContent(MatchProgressReducer.ANNOUNCEMENT_TIEBREAK, state, t);
  assert.equal(tb.showSkipSides, false);
  assert.match(tb.message, /"games":4/);
});

test('super TB and deciding point copy match Android types', () => {
  const state = matchState({ matchConfig: new MatchConfig({ setsToWin: 2, superTiebreakPoints: 10 }) });
  const stb = announcementContent(MatchProgressReducer.ANNOUNCEMENT_SUPER_TIEBREAK, state, t);
  assert.match(stb.message, /"sets":1/);
  const dp = announcementContent(MatchProgressReducer.ANNOUNCEMENT_DECIDING_POINT, state, t);
  assert.equal(dp.icon, '❗');
});

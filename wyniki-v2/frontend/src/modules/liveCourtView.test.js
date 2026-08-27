import assert from 'node:assert/strict';
import test from 'node:test';
import { spokenScore } from '../a11y/scoreNarration.js';
import { createLiveCourtView } from './liveCourtView.js';

function makeView(court) {
  const accessibility = {
    versus: 'versus',
    serving: 'serving',
    points: 'points',
    tieBreak: 'tie-break',
    superTieBreak: 'super tie-break',
    set: 'Set {number}',
    active: 'active',
    scoreJoiner: 'to',
  };
  return {
    courts: { c3: court },
    acc() { return accessibility; },
    tr() {
      return {
        players: { defaultA: 'Player A', defaultB: 'Player B' },
        table: { columns: {} },
        footer: { set: 'Set' },
      };
    },
    t(_key, values) { return `Court ${values.court}`; },
    spokenScore(left, right) { return spokenScore(accessibility, left, right); },
    ...createLiveCourtView(),
  };
}

test('heading aria includes the spoken score summary', () => {
  const view = makeView({
    court_name: '3',
    serve: 'B',
    current_set: 2,
    match_status: { active: true },
    A: { full_name: 'Kamil Szulc / Sascha zur Borg', set1: 0, set2: 0, current_games: 0, points: '15' },
    B: { full_name: 'Michael Leigh / Reuben Alexander Fairbank', set1: 4, set2: 0, current_games: 0, points: '0' },
  });

  const spoken = view.getHeadingAria('c3');
  assert.match(spoken, /^Court 3: Kamil Szulc \/ Sascha zur Borg versus Michael Leigh \/ Reuben Alexander Fairbank\./);
  assert.equal(spoken.includes('\u200B'), false);
  assert.match(spoken, /Michael Leigh \/ Reuben Alexander Fairbank serving/);
  assert.match(spoken, /points 15 to 0/);
  assert.match(spoken, /Set 1, 0 to 4/);
  assert.match(spoken, /Set 2, active, 0 to 0/);
});

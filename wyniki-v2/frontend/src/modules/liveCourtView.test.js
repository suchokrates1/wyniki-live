import assert from 'node:assert/strict';
import test from 'node:test';
import { spokenScore } from '../a11y/scoreNarration.js';
import { TEAM_WRAP_BREAK } from '../shared/teamDisplay.js';
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

test('visual TV board stays decorative and spoken names drop wrap marks', () => {
  const view = makeView({
    court_name: '3',
    serve: 'A',
    current_set: 1,
    match_status: { active: true },
    A: { full_name: `Kamil Szulc / ${TEAM_WRAP_BREAK}Sascha zur Borg`, set1: 1, points: '40' },
    B: { full_name: 'Michael Leigh / Reuben Alexander Fairbank', set1: 0, points: '30' },
  });

  const html = view.renderLiveTvScoreboard('c3');
  assert.match(html, /class="sb-tv/);
  assert.match(html, /Court 3/);
  assert.equal(html.includes('aria-live'), false);
  assert.equal(html.includes(TEAM_WRAP_BREAK), false);
  assert.match(html, /Kamil Szulc \/ Sascha zur Borg/);

  view.t = (_key, values) => `Platz ${values.court}`;
  assert.match(view.renderLiveTvScoreboard('c3'), /Platz 3/);
  view.t = (_key, values) => `Kortas ${values.court}`;
  assert.match(view.renderLiveTvScoreboard('c3'), /Kortas 3/);

  const summary = view.getScoreSummary('c3');
  assert.equal(summary.includes(TEAM_WRAP_BREAK), false);
  assert.match(summary, /Kamil Szulc \/ Sascha zur Borg serving/);
  assert.match(summary, /points 40 to 30/);
});

test('courtMatchClock uses started_ts instead of frozen seconds', () => {
  const started = '2026-09-01T10:00:00.000Z';
  const view = makeView({
    match_status: { active: true },
    match_time: {
      seconds: 0,
      running: true,
      offset_seconds: 0,
      started_ts: started,
      resume_ts: started,
    },
  });
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-09-01T11:03:00.000Z');
  try {
    assert.equal(view.courtMatchClock('c3'), '01:03');
  } finally {
    Date.now = originalNow;
  }
});

test('homepage keeps a finished score during the hold window', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const view = makeView({
    court_name: '3',
    match_status: { active: false, last_completed: '2026-09-12T11:57:00.000Z' },
    A: { full_name: 'Ada Nowak', points: '0', set1: 4, set2: 4 },
    B: { full_name: 'Ewa Lis', points: '0', set1: 1, set2: 2 },
  });
  view.syncScoreboardSlots(now);
  assert.deepEqual(view.getCourtIds(), ['c3']);
  assert.equal(view.isBoardOff('c3'), false);
  assert.match(view.getHeadingAria('c3'), /Ada Nowak/);
});

test('homepage hides empty courts and expired leftovers', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const view = makeView({
    court_name: '3',
    match_status: { active: false, last_completed: '2026-09-12T11:50:00.000Z' },
    A: { full_name: 'Ada Nowak' },
    B: { full_name: 'Ewa Lis' },
  });
  view.courts.empty = {
    court_name: '4',
    match_status: { active: false, last_completed: null },
    A: { surname: '-' },
    B: { surname: '-' },
  };
  view.syncScoreboardSlots(now);
  assert.deepEqual(view.getCourtIds(), []);
});

test('new names during the hold slide the old board off first', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const view = makeView({
    court_name: '3',
    match_status: { active: false, last_completed: '2026-09-12T11:57:00.000Z' },
    A: { full_name: 'Ada Nowak', set1: 4, set2: 4 },
    B: { full_name: 'Ewa Lis', set1: 1, set2: 2 },
  });
  view.syncScoreboardSlots(now);
  view.courts.c3 = {
    court_name: '3',
    match_status: { active: true, last_completed: null },
    A: { full_name: 'Piotr Kot', set1: 0, points: '0' },
    B: { full_name: 'Jan Bąk', set1: 0, points: '0' },
  };
  view.syncScoreboardSlots(now);
  assert.equal(view.isBoardOff('c3'), true);
  assert.match(view.getSpokenPlayerName('c3', 'A'), /Ada Nowak/);
  view.completeBoardExit('c3');
  assert.equal(view.isBoardOff('c3'), false);
  assert.match(view.getSpokenPlayerName('c3', 'A'), /Piotr Kot/);
  assert.deepEqual(view.getCourtIds(), ['c3']);
});

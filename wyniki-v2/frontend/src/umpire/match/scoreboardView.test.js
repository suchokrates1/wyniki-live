import assert from 'node:assert/strict';
import test from 'node:test';
import { SetScore } from '../match-engine/models.js';
import { matchState } from '../match-engine/testSupport.js';
import { buildScoreboard, countryFlag, formatSetScore } from './scoreboardView.js';

test('scoreboard shows live set 1 then archived TB suffix', () => {
  const state = matchState();
  state.player1Games = 2;
  state.player2Games = 1;
  state.player1Points = 3;
  const live = buildScoreboard(state);
  assert.equal(live.set1.p1, '2');
  assert.equal(live.set1.active, true);
  assert.equal(live.p1Points, '40');
  assert.equal(live.p1Serving, true);
  assert.equal(live.p1Flag, '🇵🇱');

  state.setsHistory.push(new SetScore({
    setNumber: 1,
    player1Games: 5,
    player2Games: 4,
    tiebreakLoserPoints: 3,
  }));
  state.player1Games = 1;
  state.player2Games = 0;
  const after = buildScoreboard(state);
  assert.equal(after.set1.p2, '4(3)');
  assert.equal(after.set2.p1, '1');
  assert.equal(after.set2.active, true);
});

test('flag and TB suffix helpers', () => {
  assert.equal(countryFlag('pl'), '🇵🇱');
  assert.equal(countryFlag('X'), '');
  assert.equal(formatSetScore(4, 5, 7), '4(7)');
  assert.equal(formatSetScore(5, 4, 7), '5');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { FinishMatchRequest, MatchFinishReason } from './models.js';
import { MatchFinishOutcomeApplier } from './matchFinishOutcomeApplier.js';
import { matchState } from './testSupport.js';

test('appliesWalkoverScoreForSelectedWinner', () => {
  const state = matchState();
  state.matchStartTime = 1_000;
  state.player1Games = 3;
  state.player2Games = 2;

  MatchFinishOutcomeApplier.apply(
    state,
    new FinishMatchRequest({
      finishReason: MatchFinishReason.WALKOVER,
      winnerName: 'Adam Nowak',
    }),
    11_000,
  );

  assert.equal(state.isMatchFinished, true);
  assert.equal(state.finishReason, MatchFinishReason.WALKOVER);
  assert.equal(state.finishWinnerName, 'Adam Nowak');
  assert.equal(state.player1Sets, 0);
  assert.equal(state.player2Sets, 2);
  assert.equal(state.setsHistory.length, 2);
  assert.equal(state.setsHistory[0].player1Games, 0);
  assert.equal(state.setsHistory[0].player2Games, 4);
  assert.equal(state.matchDuration, 10_000);
});

test('appliesRetirementWithoutOverwritingCurrentScore', () => {
  const state = matchState();
  state.player1Sets = 1;
  state.player2Sets = 0;
  state.player1Games = 2;
  state.player2Games = 1;

  MatchFinishOutcomeApplier.apply(
    state,
    new FinishMatchRequest({
      finishReason: MatchFinishReason.RETIREMENT,
      winnerName: 'Jan Kowalski',
      injuredPlayerName: 'Adam Nowak',
    }),
    5_000,
  );

  assert.equal(state.isMatchFinished, true);
  assert.equal(state.finishReason, MatchFinishReason.RETIREMENT);
  assert.equal(state.finishWinnerName, 'Jan Kowalski');
  assert.equal(state.injuredPlayerName, 'Adam Nowak');
  assert.equal(state.player1Sets, 1);
  assert.equal(state.player2Sets, 0);
  assert.equal(state.player1Games, 2);
  assert.equal(state.player2Games, 1);
});

test('appliesTestFinishWithoutChangingScore', () => {
  const state = matchState();
  state.player1Games = 1;
  state.player2Games = 0;

  MatchFinishOutcomeApplier.apply(
    state,
    new FinishMatchRequest({ finishReason: MatchFinishReason.TEST }),
    5_000,
  );

  assert.equal(state.isMatchFinished, true);
  assert.equal(state.finishReason, MatchFinishReason.TEST);
  assert.equal(state.player1Games, 1);
  assert.equal(state.player2Games, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { FinishMatchRequest, MatchFinishReason } from '../match-engine/models.js';
import { MatchFinishOutcomeApplier } from '../match-engine/matchFinishOutcomeApplier.js';
import { matchState } from '../match-engine/testSupport.js';
import { createHistory, formatHistoryDuration, formatHistoryScore, historyEntryFromState } from './history.js';
import { createMemoryTable } from './memoryTable.js';

test('history skips TEST finishes and lists newest first', async () => {
  const history = createHistory({ table: createMemoryTable() });
  const testMatch = matchState();
  MatchFinishOutcomeApplier.apply(testMatch, new FinishMatchRequest({ finishReason: MatchFinishReason.TEST }), 5_000);
  assert.equal(historyEntryFromState(testMatch, 5_000), null);

  const real = matchState();
  real.matchStartTime = 1_000;
  real.player1Sets = 2;
  MatchFinishOutcomeApplier.apply(real, new FinishMatchRequest({ finishReason: MatchFinishReason.NORMAL }), 9_000);
  const entry = historyEntryFromState(real, 9_000);
  await history.save(entry);
  const listed = await history.list();
  assert.equal(listed.length, 1);
  assert.equal(formatHistoryScore(listed[0]), '2 : 0');
  assert.equal(listed[0].winnerName, 'Kowalski');
  assert.equal(formatHistoryDuration({ duration: 8_000 }), '00:08');
});

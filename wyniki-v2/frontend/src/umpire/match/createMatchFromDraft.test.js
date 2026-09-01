import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig, StatsMode } from '../match-engine/models.js';
import { startDraft } from '../matchConfigForm.js';
import { createMatchFromDraft } from './createMatchFromDraft.js';

test('createMatchFromDraft maps singles and TB-only onto MatchState', () => {
  const draft = startDraft({
    selectedPlayers: [
      { id: 1, name: 'Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
      { id: 2, name: 'Nowak', firstName: 'Adam', lastName: 'Nowak' },
    ],
    isDoubles: false,
    courtId: 't31-1',
    courtName: 'Kort 1',
    config: new MatchConfig({
      statsMode: StatsMode.BASIC,
      tiebreakOnly: true,
      superTiebreakPoints: 10,
    }),
    umpireName: 'Anna',
  });
  const state = createMatchFromDraft(draft);
  assert.equal(state.player1.lastName, 'Kowalski');
  assert.equal(state.player2.lastName, 'Nowak');
  assert.equal(state.isSuperTiebreak, true);
  assert.equal(state.statsMode, StatsMode.BASIC);
  assert.equal(state.umpireName, 'Anna');
});

test('createMatchFromDraft keeps remapped doubles slots', () => {
  const draft = startDraft({
    selectedPlayers: [
      { id: 1, name: 'A' },
      { id: 2, name: 'A-partner' },
      { id: 3, name: 'B' },
      { id: 4, name: 'B-partner' },
    ],
    isDoubles: true,
    courtId: 't31-2',
    courtName: 'Kort 2',
    config: new MatchConfig({ statsMode: StatsMode.BASIC }),
    team1Name: 'A / A-partner',
    team2Name: 'B / B-partner',
  });
  const state = createMatchFromDraft(draft);
  assert.equal(state.player1.id, 1);
  assert.equal(state.player2.id, 3);
  assert.equal(state.player3.id, 2);
  assert.equal(state.player4.id, 4);
  assert.equal(state.getTeam1FullName(), 'A / A-partner');
});

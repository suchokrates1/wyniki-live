import assert from 'node:assert/strict';
import test from 'node:test';
import { matchState } from '../match-engine/testSupport.js';
import { DirectorCommandApplier } from '../match-engine/directorCommandApplier.js';
import { toMatchPayload } from '../match/matchPayload.js';
import { parseDirectorCommand } from './directorCommandParse.js';

test('API snake_case command moves court and next PUT uses the new court_id', () => {
  const state = matchState({
    matchId: 671,
    clientMatchUuid: 'uuid-gonzalez',
    courtId: 't31-2',
    courtName: 'Kort 2',
  });
  const command = parseDirectorCommand({
    id: 'cmd-vilnius',
    match_id: 671,
    client_match_uuid: 'uuid-gonzalez',
    court_id: 't31-8',
    court_name: 'Kort 8',
    court_token: 'new-token',
    player1_name: 'Jessica González',
    player2_name: 'Daniela Schmidt',
    score: { player1_sets: 0, player2_sets: 1, player1_games: 0, player2_games: 4 },
    match_config: { games_per_set: 4, no_advantage: true, stats_mode: 'BASIC' },
  });
  assert.equal(DirectorCommandApplier.appliesTo(state, command), true);
  const next = DirectorCommandApplier.apply(state, command);
  assert.equal(next.courtId, 't31-8');
  assert.equal(toMatchPayload(next).court_id, 't31-8');
  assert.equal(next.player1.getFullName(), 'Jessica González');
  assert.equal(next.matchConfig.noAdvantage, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchState } from './models.js';
import { Player } from './player.js';
import { DirectorCommandApplier } from './directorCommandApplier.js';
import { directorCommandDto, directorScoreDto, matchConfigDto } from './directorDtos.js';

const playerOne = new Player({
  id: 1,
  name: 'Emil Stopierzyński',
  firstName: 'Emil',
  lastName: 'Stopierzyński',
  flag: 'PL',
});
const playerTwo = new Player({
  id: 2,
  name: 'Courtney Webeck',
  firstName: 'Courtney',
  lastName: 'Webeck',
  flag: 'AU',
});

test('appliesCourtNamesScoreAndRulesToLiveState', () => {
  const state = new MatchState({
    matchId: 671,
    clientMatchUuid: 'uuid-gonzalez',
    player1: playerOne,
    player2: playerTwo,
    courtId: 't31-2',
    courtName: 'Kort 2',
  });
  state.player1Games = 0;
  state.player2Games = 3;

  const next = DirectorCommandApplier.apply(
    state,
    directorCommandDto({
      id: 'cmd-1',
      matchId: 671,
      clientMatchUuid: 'uuid-gonzalez',
      courtId: 't31-8',
      courtName: 'Kort 8',
      player1Name: 'Jessica González',
      player2Name: 'Daniela Schmidt',
      score: directorScoreDto({ player1Games: 0, player2Games: 4, player2Sets: 1 }),
      matchConfig: matchConfigDto({ gamesPerSet: 4, setsToWin: 2, noAdvantage: true }),
    }),
  );

  assert.equal(next.courtId, 't31-8');
  assert.equal(next.courtName, 'Kort 8');
  assert.equal(next.player1.getFullName(), 'Jessica González');
  assert.equal(next.player2.getFullName(), 'Daniela Schmidt');
  assert.equal(next.player2Sets, 1);
  assert.equal(next.player2Games, 4);
  assert.equal(next.matchConfig.noAdvantage, true);
  assert.equal(next.noAdvantage, true);
});

test('ignoresCommandForAnotherMatch', () => {
  const state = new MatchState({
    matchId: 667,
    clientMatchUuid: 'uuid-justyna',
    player1: playerOne,
    player2: playerTwo,
    courtId: 't31-2',
    courtName: 'Kort 2',
  });
  const command = directorCommandDto({
    matchId: 671,
    clientMatchUuid: 'uuid-gonzalez',
    courtId: 't31-8',
  });
  assert.equal(DirectorCommandApplier.appliesTo(state, command), false);
});

test('doublesRenameUpdatesTeamDisplayNames', () => {
  const state = new MatchState({
    matchId: 10,
    clientMatchUuid: 'uuid-doubles',
    player1: playerOne,
    player2: playerTwo,
    courtId: 't31-2',
    courtName: 'Kort 2',
    isDoubles: true,
    team1Name: 'Old Pair A',
    team2Name: 'Old Pair B',
  });
  const next = DirectorCommandApplier.apply(
    state,
    directorCommandDto({
      matchId: 10,
      clientMatchUuid: 'uuid-doubles',
      player1Name: 'New Pair A',
      player2Name: 'New Pair B',
    }),
  );
  assert.equal(next.getTeam1FullName(), 'New Pair A');
  assert.equal(next.getTeam2FullName(), 'New Pair B');
});

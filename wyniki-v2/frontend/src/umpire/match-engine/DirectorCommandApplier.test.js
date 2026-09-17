import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig, MatchState, StatsMode } from './models.js';
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

test('courtMoveWithoutScoreKeepsGamePoints', () => {
  const state = new MatchState({
    matchId: 671,
    clientMatchUuid: 'uuid-gonzalez',
    player1: playerOne,
    player2: playerTwo,
    courtId: 't31-2',
    courtName: 'Kort 2',
  });
  state.player1Points = 1;
  state.player2Points = 0;
  const next = DirectorCommandApplier.apply(
    state,
    directorCommandDto({
      matchId: 671,
      clientMatchUuid: 'uuid-gonzalez',
      courtId: 't31-8',
      courtName: 'Kort 8',
    }),
  );
  assert.equal(next.courtId, 't31-8');
  assert.equal(next.player1Points, 1);
  assert.equal(next.player2Points, 0);
});

test('rulesPatchWithoutStatsModeKeepsBasicScoring', () => {
  const state = new MatchState({
    matchId: 12,
    clientMatchUuid: 'uuid-basic',
    player1: playerOne,
    player2: playerTwo,
    courtId: 't31-1',
    courtName: 'Kort 1',
    matchConfig: new MatchConfig({ statsMode: StatsMode.BASIC }),
    statsMode: StatsMode.BASIC,
  });
  const next = DirectorCommandApplier.apply(
    state,
    directorCommandDto({
      matchId: 12,
      clientMatchUuid: 'uuid-basic',
      matchConfig: matchConfigDto({ gamesPerSet: 3, setsToWin: 1, noAdvantage: true }),
    }),
  );
  assert.equal(next.matchConfig.gamesPerSet, 3);
  assert.equal(next.matchConfig.noAdvantage, true);
  assert.equal(next.statsMode, StatsMode.BASIC);
  assert.equal(next.matchConfig.statsMode, StatsMode.BASIC);
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

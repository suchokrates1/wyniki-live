import { MatchConfig, MatchState } from './models.js';
import { Player } from './player.js';

export const playerOne = new Player({
  id: 1,
  name: 'Kowalski',
  firstName: 'Jan',
  lastName: 'Kowalski',
  flag: 'PL',
});
export const playerTwo = new Player({
  id: 2,
  name: 'Nowak',
  firstName: 'Adam',
  lastName: 'Nowak',
  flag: 'DE',
});
export const playerThree = new Player({
  id: 3,
  name: 'Lis',
  firstName: 'Ewa',
  lastName: 'Lis',
});
export const playerFour = new Player({
  id: 4,
  name: 'Wojcik',
  firstName: 'Anna',
  lastName: 'Wojcik',
});

export function matchState({
  isDoubles = false,
  noAdvantage = false,
  matchConfig = new MatchConfig(),
  statsMode,
  manualStartTime = null,
  team1Name = null,
  team2Name = null,
  matchId = null,
  clientMatchUuid,
  courtId = '1',
  courtName = 'Court 1',
  player1 = playerOne,
  player2 = playerTwo,
} = {}) {
  return new MatchState({
    matchId,
    clientMatchUuid,
    player1,
    player2,
    player3: isDoubles ? playerThree : null,
    player4: isDoubles ? playerFour : null,
    courtId,
    courtName,
    isDoubles,
    noAdvantage,
    matchConfig,
    statsMode: statsMode ?? matchConfig.statsMode,
    manualStartTime,
    team1Name,
    team2Name,
  });
}

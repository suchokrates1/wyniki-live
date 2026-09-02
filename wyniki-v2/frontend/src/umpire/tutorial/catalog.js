import { Player } from '../match-engine/player.js';

export const TUTORIAL_PIN = '1234';
export const TUTORIAL_COURT_1 = 'tutorial-1';
export const TUTORIAL_COURT_2 = 'tutorial-2';
export const TUTORIAL_MATCH_UUID = 'tutorial-demo-match';
export const TUTORIAL_PLAYER_1_ID = 9001;
export const TUTORIAL_PLAYER_2_ID = 9002;

export function tutorialCatalog(t) {
  const player1 = {
    id: TUTORIAL_PLAYER_1_ID,
    first_name: t('tutorialDemoPlayer1First'),
    last_name: t('tutorialDemoPlayer1Last'),
    firstName: t('tutorialDemoPlayer1First'),
    lastName: t('tutorialDemoPlayer1Last'),
    name: `${t('tutorialDemoPlayer1First')} ${t('tutorialDemoPlayer1Last')}`.trim(),
    gender: 'F',
    flag: 'IT',
  };
  const player2 = {
    id: TUTORIAL_PLAYER_2_ID,
    first_name: t('tutorialDemoPlayer2First'),
    last_name: t('tutorialDemoPlayer2Last'),
    firstName: t('tutorialDemoPlayer2First'),
    lastName: t('tutorialDemoPlayer2Last'),
    name: `${t('tutorialDemoPlayer2First')} ${t('tutorialDemoPlayer2Last')}`.trim(),
    gender: 'M',
    flag: 'PL',
  };
  return {
    tournament: {
      id: 'tutorial',
      name: t('tutorialDemoTournament'),
      start_date: '2099-01-01',
      end_date: '2099-01-02',
    },
    courts: [
      {
        id: TUTORIAL_COURT_1,
        kort_id: TUTORIAL_COURT_1,
        name: '1',
        is_available: true,
      },
      {
        id: TUTORIAL_COURT_2,
        kort_id: TUTORIAL_COURT_2,
        name: '2',
        is_available: true,
      },
    ],
    players: [player1, player2],
    pin: TUTORIAL_PIN,
  };
}

export function overlayTutorialPlayers(state, t) {
  if (!state) return state;
  const catalog = tutorialCatalog(t);
  const [one, two] = catalog.players;
  state.player1 = new Player(one);
  state.player2 = new Player(two);
  return state;
}

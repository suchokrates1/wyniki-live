import { MatchProgressReducer } from '../match-engine/matchProgressReducer.js';

function lastCompletedSet(state) {
  return state.setsHistory[state.setsHistory.length - 1] || null;
}

function setWinnerName(state, setScore) {
  const player1Won = setScore.player1Games > setScore.player2Games;
  if (state.isDoubles) {
    const team = player1Won ? state.team1Name : state.team2Name;
    if (team) return team;
  }
  const player = player1Won ? state.player1 : state.player2;
  return player?.getDisplayName?.() || '';
}

function setChangesEnds(setScore) {
  return (setScore.player1Games + setScore.player2Games) % 2 === 1;
}

export function announcementContent(type, state, t) {
  switch (type) {
    case MatchProgressReducer.ANNOUNCEMENT_SET: {
      const setScore = lastCompletedSet(state);
      const changeEnds = setScore ? setChangesEnds(setScore) : false;
      return {
        icon: '⏱️',
        title: t('announceSet', { set: setScore?.setNumber || 1 }),
        message: t(changeEnds ? 'announceSetMsgChange' : 'announceSetMsgStay', {
          winner: setScore ? setWinnerName(state, setScore) : '',
          p1: setScore?.player1Games ?? 0,
          p2: setScore?.player2Games ?? 0,
        }),
        showSkipSides: changeEnds,
      };
    }
    case MatchProgressReducer.ANNOUNCEMENT_SIDE_CHANGE:
      return {
        icon: '🔄',
        title: t('announceSideChange'),
        message: t('announceSideChangeMsg'),
        showSkipSides: true,
      };
    case MatchProgressReducer.ANNOUNCEMENT_TIEBREAK:
      return {
        icon: '🎾',
        title: t('announceTiebreak'),
        message: t('announceTiebreakMsg', {
          games: state.matchConfig.gamesPerSet,
          points: state.matchConfig.tiebreakPoints,
        }),
        showSkipSides: false,
      };
    case MatchProgressReducer.ANNOUNCEMENT_SUPER_TIEBREAK:
      return {
        icon: '🏆',
        title: t('announceSuperTiebreak'),
        message: t('announceSuperTiebreakMsg', {
          sets: state.matchConfig.setsToWin - 1,
          points: state.matchConfig.superTiebreakPoints,
        }),
        showSkipSides: false,
      };
    case MatchProgressReducer.ANNOUNCEMENT_DECIDING_POINT:
      return {
        icon: '❗',
        title: t('announceDecidingPoint'),
        message: t('announceDecidingPointMsg'),
        showSkipSides: false,
      };
    default:
      return {
        icon: '',
        title: '',
        message: '',
        showSkipSides: false,
      };
  }
}

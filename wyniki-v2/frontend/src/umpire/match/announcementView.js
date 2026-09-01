import { MatchProgressReducer } from '../match-engine/matchProgressReducer.js';

export function announcementContent(type, state, t) {
  switch (type) {
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

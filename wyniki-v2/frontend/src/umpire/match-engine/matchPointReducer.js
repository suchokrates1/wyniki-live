import { TiebreakServeRule } from './tiebreakServeRule.js';

export const MatchPointEvent = Object.freeze({
  Point: 'Point',
  ServeChange: 'ServeChange',
  SideChange: 'SideChange',
});

export const MatchPointReducer = {
  ANNOUNCEMENT_SIDE_CHANGE: 'side_change',

  addPoint(state, isPlayer1) {
    const events = [MatchPointEvent.Point];

    if (isPlayer1) {
      state.player1Points += 1;
    } else {
      state.player2Points += 1;
    }

    let announcementType = null;
    let showAnnouncementImmediately = false;

    if (state.isTiebreak || state.isSuperTiebreak) {
      const totalPoints = state.player1Points + state.player2Points;

      if (totalPoints % 2 === 1 && !state.isGameWon()) {
        TiebreakServeRule.rotate(state);
        events.push(MatchPointEvent.ServeChange);
      }

      if (totalPoints > 0 && totalPoints % 6 === 0 && !state.isGameWon()) {
        state.sidesSwapped = !state.sidesSwapped;
        events.push(MatchPointEvent.SideChange);
        announcementType = this.ANNOUNCEMENT_SIDE_CHANGE;
        showAnnouncementImmediately = true;
      }
    }

    return {
      events,
      announcementType,
      showAnnouncementImmediately,
    };
  },
};

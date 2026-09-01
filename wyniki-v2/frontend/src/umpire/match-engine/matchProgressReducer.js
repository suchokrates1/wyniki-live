import { SetScore } from './models.js';
import { TiebreakServeRule } from './tiebreakServeRule.js';

export const MatchProgressEvent = Object.freeze({
  Game: 'Game',
  Set: 'Set',
});

export const MatchProgressScreen = Object.freeze({
  Scoring: 'Scoring',
  Announcement: 'Announcement',
  MatchFinished: 'MatchFinished',
});

export const MatchProgressReducer = {
  ANNOUNCEMENT_SIDE_CHANGE: 'side_change',
  ANNOUNCEMENT_TIEBREAK: 'tiebreak',
  ANNOUNCEMENT_SUPER_TIEBREAK: 'super_tiebreak',
  ANNOUNCEMENT_DECIDING_POINT: 'deciding_point',

  reduceAfterPoint(state, currentAnnouncementType, nowMs) {
    let pendingAnnouncementType = currentAnnouncementType;
    const events = [];

    if (!state.isGameWon()) {
      if (
        state.noAdvantage
        && state.player1Points === 3
        && state.player2Points === 3
        && !state.isTiebreak
        && !state.isSuperTiebreak
      ) {
        return {
          events: [],
          announcementType: this.ANNOUNCEMENT_DECIDING_POINT,
          nextScreen: MatchProgressScreen.Announcement,
          publishState: true,
          syncMatch: false,
          finalizeMatch: false,
        };
      }

      return {
        events: [],
        announcementType: pendingAnnouncementType,
        nextScreen: MatchProgressScreen.Scoring,
        publishState: false,
        syncMatch: false,
        finalizeMatch: false,
      };
    }

    const completedTiebreak = state.isTiebreak || state.isSuperTiebreak;
    const player1Won = state.player1Points > state.player2Points;

    if (completedTiebreak) {
      const wasSuperTiebreak = state.isSuperTiebreak;
      const tiebreakLoserPoints = player1Won ? state.player2Points : state.player1Points;

      if (wasSuperTiebreak) {
        if (player1Won) state.player1Sets += 1;
        else state.player2Sets += 1;
        state.setsHistory.push(new SetScore({
          setNumber: state.setsHistory.length + 1,
          player1Games: state.player1Points,
          player2Games: state.player2Points,
          tiebreakLoserPoints,
          isSuperTiebreak: true,
        }));
      } else {
        if (player1Won) state.player1Games += 1;
        else state.player2Games += 1;
        if (player1Won) state.player1Sets += 1;
        else state.player2Sets += 1;
        state.setsHistory.push(new SetScore({
          setNumber: state.setsHistory.length + 1,
          player1Games: state.player1Games,
          player2Games: state.player2Games,
          tiebreakLoserPoints,
        }));
      }

      state.player1Games = 0;
      state.player2Games = 0;
      state.isTiebreak = false;
      state.isSuperTiebreak = false;
      state.sidesSwapped = !state.sidesSwapped;
      state.totalGamesPlayed = 0;
      pendingAnnouncementType = this.ANNOUNCEMENT_SIDE_CHANGE;

      if (state.shouldEndMatch()) {
        state.isMatchFinished = true;
        state.matchDuration = nowMs - state.matchStartTime;
        return {
          events,
          announcementType: pendingAnnouncementType,
          nextScreen: MatchProgressScreen.MatchFinished,
          publishState: true,
          syncMatch: false,
          finalizeMatch: true,
        };
      }

      TiebreakServeRule.assignFirstGameOfNextSet(state);

      const setsToWinTiebreak = state.matchConfig.setsToWin;
      if (
        state.player1Sets === (setsToWinTiebreak - 1)
        && state.player2Sets === (setsToWinTiebreak - 1)
      ) {
        state.isSuperTiebreak = true;
        TiebreakServeRule.captureOpeningServer(state);
        pendingAnnouncementType = this.ANNOUNCEMENT_SUPER_TIEBREAK;
      }
    } else {
      if (player1Won) state.player1Games += 1;
      else state.player2Games += 1;

      state.totalGamesPlayed += 1;
      if (state.totalGamesPlayed % 2 === 1) {
        state.sidesSwapped = !state.sidesSwapped;
        pendingAnnouncementType = this.ANNOUNCEMENT_SIDE_CHANGE;
      }
    }

    state.player1Points = 0;
    state.player2Points = 0;

    if (!completedTiebreak) {
      TiebreakServeRule.rotate(state);
    }
    events.push(MatchProgressEvent.Game);

    if (state.isSetWon()) {
      const setWinner = state.player1Games > state.player2Games ? 1 : 2;
      if (setWinner === 1) state.player1Sets += 1;
      else state.player2Sets += 1;

      state.setsHistory.push(new SetScore({
        setNumber: state.setsHistory.length + 1,
        player1Games: state.player1Games,
        player2Games: state.player2Games,
      }));
      events.push(MatchProgressEvent.Set);

      if (state.shouldEndMatch()) {
        state.isMatchFinished = true;
        state.matchDuration = nowMs - state.matchStartTime;
        return {
          events,
          announcementType: pendingAnnouncementType,
          nextScreen: MatchProgressScreen.MatchFinished,
          publishState: true,
          syncMatch: false,
          finalizeMatch: true,
        };
      }

      const setsToWin = state.matchConfig.setsToWin;
      if (state.player1Sets === (setsToWin - 1) && state.player2Sets === (setsToWin - 1)) {
        state.isSuperTiebreak = true;
        TiebreakServeRule.captureOpeningServer(state);
        pendingAnnouncementType = this.ANNOUNCEMENT_SUPER_TIEBREAK;
      }

      state.player1Games = 0;
      state.player2Games = 0;
      state.totalGamesPlayed = 0;
    }

    if (state.shouldStartTiebreak() && !state.isSuperTiebreak) {
      state.isTiebreak = true;
      TiebreakServeRule.captureOpeningServer(state);
      pendingAnnouncementType = this.ANNOUNCEMENT_TIEBREAK;
    }

    return {
      events,
      announcementType: pendingAnnouncementType,
      nextScreen: pendingAnnouncementType != null
        ? MatchProgressScreen.Announcement
        : MatchProgressScreen.Scoring,
      publishState: true,
      syncMatch: true,
      finalizeMatch: false,
    };
  },
};

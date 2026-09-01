/**
 * Port of android `domain/match/model/*`.
 * Kotlin data-class defaults and scoring helpers are the oracle.
 */
import { randomUUID } from 'node:crypto';

export const StatsMode = Object.freeze({
  BASIC: 'BASIC',
  ADVANCED: 'ADVANCED',
});

export const MatchStatus = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
});

export const MatchFinishReason = Object.freeze({
  NORMAL: 'NORMAL',
  TEST: 'TEST',
  RETIREMENT: 'RETIREMENT',
  WALKOVER: 'WALKOVER',
});

export const ActionType = Object.freeze({
  ACE: 'ACE',
  FAULT: 'FAULT',
  DOUBLE_FAULT: 'DOUBLE_FAULT',
  FOOT_FAULT: 'FOOT_FAULT',
  WINNER: 'WINNER',
  FORCED_ERROR: 'FORCED_ERROR',
  UNFORCED_ERROR: 'UNFORCED_ERROR',
  BALL_IN_PLAY: 'BALL_IN_PLAY',
  GAME_WON: 'GAME_WON',
  SET_WON: 'SET_WON',
});

export class MatchConfig {
  constructor({
    gamesPerSet = 4,
    setsToWin = 2,
    tiebreakPoints = 7,
    superTiebreakPoints = 10,
    statsMode = StatsMode.ADVANCED,
    noAdvantage = false,
    tiebreakOnly = false,
  } = {}) {
    this.gamesPerSet = gamesPerSet;
    this.setsToWin = setsToWin;
    this.tiebreakPoints = tiebreakPoints;
    this.superTiebreakPoints = superTiebreakPoints;
    this.statsMode = statsMode;
    this.noAdvantage = noAdvantage;
    this.tiebreakOnly = tiebreakOnly;
  }

  get tiebreakAt() {
    return this.gamesPerSet;
  }

  get gamesForSetWinWithMargin() {
    return this.gamesPerSet + 1;
  }

  copy(overrides = {}) {
    return new MatchConfig({
      gamesPerSet: this.gamesPerSet,
      setsToWin: this.setsToWin,
      tiebreakPoints: this.tiebreakPoints,
      superTiebreakPoints: this.superTiebreakPoints,
      statsMode: this.statsMode,
      noAdvantage: this.noAdvantage,
      tiebreakOnly: this.tiebreakOnly,
      ...overrides,
    });
  }

  static shortSets() {
    return new MatchConfig({ gamesPerSet: 4 });
  }

  static fullSets() {
    return new MatchConfig({ gamesPerSet: 6 });
  }

  static miniSets() {
    return new MatchConfig({ gamesPerSet: 3 });
  }

  static tiebreakOnly(points = 10) {
    return new MatchConfig({
      setsToWin: 1,
      superTiebreakPoints: points,
      tiebreakOnly: true,
    });
  }
}

export class MatchStatistics {
  constructor({
    aces = 0,
    doubleFaults = 0,
    winners = 0,
    forcedErrors = 0,
    unforcedErrors = 0,
    firstServesIn = 0,
    firstServesTotal = 0,
    secondServesIn = 0,
    secondServesTotal = 0,
  } = {}) {
    this.aces = aces;
    this.doubleFaults = doubleFaults;
    this.winners = winners;
    this.forcedErrors = forcedErrors;
    this.unforcedErrors = unforcedErrors;
    this.firstServesIn = firstServesIn;
    this.firstServesTotal = firstServesTotal;
    this.secondServesIn = secondServesIn;
    this.secondServesTotal = secondServesTotal;
  }

  getFirstServePercentage() {
    return this.firstServesTotal > 0
      ? Math.trunc((this.firstServesIn / this.firstServesTotal) * 100)
      : 0;
  }

  getSecondServePercentage() {
    return this.secondServesTotal > 0
      ? Math.trunc((this.secondServesIn / this.secondServesTotal) * 100)
      : 0;
  }

  copy() {
    return new MatchStatistics({
      aces: this.aces,
      doubleFaults: this.doubleFaults,
      winners: this.winners,
      forcedErrors: this.forcedErrors,
      unforcedErrors: this.unforcedErrors,
      firstServesIn: this.firstServesIn,
      firstServesTotal: this.firstServesTotal,
      secondServesIn: this.secondServesIn,
      secondServesTotal: this.secondServesTotal,
    });
  }

  equals(other) {
    return Boolean(other)
      && this.aces === other.aces
      && this.doubleFaults === other.doubleFaults
      && this.winners === other.winners
      && this.forcedErrors === other.forcedErrors
      && this.unforcedErrors === other.unforcedErrors
      && this.firstServesIn === other.firstServesIn
      && this.firstServesTotal === other.firstServesTotal
      && this.secondServesIn === other.secondServesIn
      && this.secondServesTotal === other.secondServesTotal;
  }
}

export class SetScore {
  constructor({
    setNumber,
    player1Games,
    player2Games,
    tiebreakLoserPoints = null,
    isSuperTiebreak = false,
  }) {
    this.setNumber = setNumber;
    this.player1Games = player1Games;
    this.player2Games = player2Games;
    this.tiebreakLoserPoints = tiebreakLoserPoints;
    this.isSuperTiebreak = isSuperTiebreak;
  }
}

export class Score {
  constructor({
    player1Sets = 0,
    player2Sets = 0,
    player1Games = 0,
    player2Games = 0,
    player1Points = 0,
    player2Points = 0,
    setsHistory = [],
  } = {}) {
    this.player1Sets = player1Sets;
    this.player2Sets = player2Sets;
    this.player1Games = player1Games;
    this.player2Games = player2Games;
    this.player1Points = player1Points;
    this.player2Points = player2Points;
    this.setsHistory = setsHistory;
  }
}

export class MatchAction {
  constructor({
    timestamp = Date.now(),
    actionType,
    previousPlayer1Points,
    previousPlayer2Points,
    previousPlayer1Games,
    previousPlayer2Games,
    previousPlayer1Sets,
    previousPlayer2Sets,
    previousIsPlayer1Serving,
    previousIsFirstServe,
    previousIsTiebreak,
    previousIsSuperTiebreak,
    previousSetsHistorySize,
    previousSidesSwapped = false,
    previousTotalGamesPlayed = 0,
    previousCurrentServer = 1,
    previousTiebreakOpeningServer = 1,
    previousIsMatchFinished = false,
    previousPlayer1Stats,
    previousPlayer2Stats,
    description,
  }) {
    this.timestamp = timestamp;
    this.actionType = actionType;
    this.previousPlayer1Points = previousPlayer1Points;
    this.previousPlayer2Points = previousPlayer2Points;
    this.previousPlayer1Games = previousPlayer1Games;
    this.previousPlayer2Games = previousPlayer2Games;
    this.previousPlayer1Sets = previousPlayer1Sets;
    this.previousPlayer2Sets = previousPlayer2Sets;
    this.previousIsPlayer1Serving = previousIsPlayer1Serving;
    this.previousIsFirstServe = previousIsFirstServe;
    this.previousIsTiebreak = previousIsTiebreak;
    this.previousIsSuperTiebreak = previousIsSuperTiebreak;
    this.previousSetsHistorySize = previousSetsHistorySize;
    this.previousSidesSwapped = previousSidesSwapped;
    this.previousTotalGamesPlayed = previousTotalGamesPlayed;
    this.previousCurrentServer = previousCurrentServer;
    this.previousTiebreakOpeningServer = previousTiebreakOpeningServer;
    this.previousIsMatchFinished = previousIsMatchFinished;
    this.previousPlayer1Stats = previousPlayer1Stats;
    this.previousPlayer2Stats = previousPlayer2Stats;
    this.description = description;
  }
}

export class FinishMatchRequest {
  constructor({
    finishReason = MatchFinishReason.NORMAL,
    winnerName = null,
    injuredPlayerName = null,
    resultNote = null,
  } = {}) {
    this.finishReason = finishReason;
    this.winnerName = winnerName;
    this.injuredPlayerName = injuredPlayerName;
    this.resultNote = resultNote;
  }
}

export class Match {
  constructor({
    id,
    courtId,
    player1Name,
    player2Name,
    score,
    status,
    createdAt,
    updatedAt,
    bracketWarning = null,
    phase = null,
    scheduleId = null,
    clientMatchUuid = null,
    finishReason = null,
    winnerName = null,
    injuredPlayerName = null,
    resultNote = null,
  }) {
    this.id = id;
    this.courtId = courtId;
    this.player1Name = player1Name;
    this.player2Name = player2Name;
    this.score = score;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.bracketWarning = bracketWarning;
    this.phase = phase;
    this.scheduleId = scheduleId;
    this.clientMatchUuid = clientMatchUuid;
    this.finishReason = finishReason;
    this.winnerName = winnerName;
    this.injuredPlayerName = injuredPlayerName;
    this.resultNote = resultNote;
  }
}

export class MatchState {
  constructor({
    matchId = null,
    clientMatchUuid = randomUUID(),
    player1,
    player2,
    player3 = null,
    player4 = null,
    courtId,
    courtName,
    scheduleId = null,
    isDoubles = false,
    isMixedDoubles = false,
    team1Name = null,
    team2Name = null,
    umpireName = null,
    manualStartTime = null,
    currentServer = 1,
    noAdvantage = false,
    matchConfig = new MatchConfig(),
    player1Sets = 0,
    player2Sets = 0,
    player1Games = 0,
    player2Games = 0,
    player1Points = 0,
    player2Points = 0,
    setsHistory = [],
    isPlayer1Serving = true,
    isFirstServe = true,
    isTiebreak = false,
    isSuperTiebreak = false,
    isMatchFinished = false,
    sidesSwapped = false,
    totalGamesPlayed = 0,
    tiebreakOpeningServer = 1,
    matchStartTime = 0,
    matchDuration = 0,
    player1Stats = new MatchStatistics(),
    player2Stats = new MatchStatistics(),
    statsMode = StatsMode.ADVANCED,
    actionsHistory = [],
    finishReason = MatchFinishReason.NORMAL,
    finishWinnerName = null,
    injuredPlayerName = null,
    resultNote = null,
  }) {
    this.matchId = matchId;
    this.clientMatchUuid = clientMatchUuid;
    this.player1 = player1;
    this.player2 = player2;
    this.player3 = player3;
    this.player4 = player4;
    this.courtId = courtId;
    this.courtName = courtName;
    this.scheduleId = scheduleId;
    this.isDoubles = isDoubles;
    this.isMixedDoubles = isMixedDoubles;
    this.team1Name = team1Name;
    this.team2Name = team2Name;
    this.umpireName = umpireName;
    this.manualStartTime = manualStartTime;
    this.currentServer = currentServer;
    this.noAdvantage = noAdvantage;
    this.matchConfig = matchConfig;
    this.player1Sets = player1Sets;
    this.player2Sets = player2Sets;
    this.player1Games = player1Games;
    this.player2Games = player2Games;
    this.player1Points = player1Points;
    this.player2Points = player2Points;
    this.setsHistory = setsHistory;
    this.isPlayer1Serving = isPlayer1Serving;
    this.isFirstServe = isFirstServe;
    this.isTiebreak = isTiebreak;
    this.isSuperTiebreak = isSuperTiebreak;
    this.isMatchFinished = isMatchFinished;
    this.sidesSwapped = sidesSwapped;
    this.totalGamesPlayed = totalGamesPlayed;
    this.tiebreakOpeningServer = tiebreakOpeningServer;
    this.matchStartTime = matchStartTime;
    this.matchDuration = matchDuration;
    this.player1Stats = player1Stats;
    this.player2Stats = player2Stats;
    this.statsMode = statsMode;
    this.actionsHistory = actionsHistory;
    this.finishReason = finishReason;
    this.finishWinnerName = finishWinnerName;
    this.injuredPlayerName = injuredPlayerName;
    this.resultNote = resultNote;
  }

  copy(overrides = {}) {
    return new MatchState({
      matchId: this.matchId,
      clientMatchUuid: this.clientMatchUuid,
      player1: this.player1,
      player2: this.player2,
      player3: this.player3,
      player4: this.player4,
      courtId: this.courtId,
      courtName: this.courtName,
      scheduleId: this.scheduleId,
      isDoubles: this.isDoubles,
      isMixedDoubles: this.isMixedDoubles,
      team1Name: this.team1Name,
      team2Name: this.team2Name,
      umpireName: this.umpireName,
      manualStartTime: this.manualStartTime,
      currentServer: this.currentServer,
      noAdvantage: this.noAdvantage,
      matchConfig: this.matchConfig,
      player1Sets: this.player1Sets,
      player2Sets: this.player2Sets,
      player1Games: this.player1Games,
      player2Games: this.player2Games,
      player1Points: this.player1Points,
      player2Points: this.player2Points,
      setsHistory: this.setsHistory,
      isPlayer1Serving: this.isPlayer1Serving,
      isFirstServe: this.isFirstServe,
      isTiebreak: this.isTiebreak,
      isSuperTiebreak: this.isSuperTiebreak,
      isMatchFinished: this.isMatchFinished,
      sidesSwapped: this.sidesSwapped,
      totalGamesPlayed: this.totalGamesPlayed,
      tiebreakOpeningServer: this.tiebreakOpeningServer,
      matchStartTime: this.matchStartTime,
      matchDuration: this.matchDuration,
      player1Stats: this.player1Stats,
      player2Stats: this.player2Stats,
      statsMode: this.statsMode,
      actionsHistory: this.actionsHistory,
      finishReason: this.finishReason,
      finishWinnerName: this.finishWinnerName,
      injuredPlayerName: this.injuredPlayerName,
      resultNote: this.resultNote,
      ...overrides,
    });
  }

  getTeam1DisplayName() {
    if (this.isDoubles && this.team1Name) return this.team1Name;
    if (this.isDoubles && this.player3 != null) {
      return `${this.player1.getDisplayName()} / ${this.player3.getDisplayName()}`;
    }
    return this.player1.getDisplayName();
  }

  getTeam1FullName() {
    if (this.isDoubles && this.team1Name) return this.team1Name;
    if (this.isDoubles && this.player3 != null) {
      return `${this.player1.getFullName()} / ${this.player3.getFullName()}`;
    }
    return this.player1.getFullName();
  }

  getTeam2DisplayName() {
    if (this.isDoubles && this.team2Name) return this.team2Name;
    if (this.isDoubles && this.player4 != null) {
      return `${this.player2.getDisplayName()} / ${this.player4.getDisplayName()}`;
    }
    return this.player2.getDisplayName();
  }

  getTeam2FullName() {
    if (this.isDoubles && this.team2Name) return this.team2Name;
    if (this.isDoubles && this.player4 != null) {
      return `${this.player2.getFullName()} / ${this.player4.getFullName()}`;
    }
    return this.player2.getFullName();
  }

  getCurrentServerName() {
    switch (this.currentServer) {
      case 1:
        return this.player1.getDisplayName();
      case 2:
        return this.player2.getDisplayName();
      case 3:
        return this.player3?.getDisplayName() ?? this.player1.getDisplayName();
      case 4:
        return this.player4?.getDisplayName() ?? this.player2.getDisplayName();
      default:
        return this.player1.getDisplayName();
    }
  }

  getTeam1ServerAwareDisplayName() {
    return formatTeamDisplay(this.player1, this.player3, this.currentServer === 1, this.currentServer === 3);
  }

  getTeam2ServerAwareDisplayName() {
    return formatTeamDisplay(this.player2, this.player4, this.currentServer === 2, this.currentServer === 4);
  }

  getMatchTypeLabel() {
    if (this.isMixedDoubles) return 'Mixed';
    if (this.isDoubles) return 'Doubles';
    return 'Singles';
  }

  getPlayer1PointsDisplay() {
    return getPointsDisplay(this.player1Points, this.player2Points, this.isTiebreak || this.isSuperTiebreak, this.noAdvantage);
  }

  getPlayer2PointsDisplay() {
    return getPointsDisplay(this.player2Points, this.player1Points, this.isTiebreak || this.isSuperTiebreak, this.noAdvantage);
  }

  isGameWon() {
    if (this.isTiebreak) {
      const tbPts = this.matchConfig.tiebreakPoints;
      return (this.player1Points >= tbPts || this.player2Points >= tbPts)
        && Math.abs(this.player1Points - this.player2Points) >= 2;
    }
    if (this.isSuperTiebreak) {
      const stbPts = this.matchConfig.superTiebreakPoints;
      return (this.player1Points >= stbPts || this.player2Points >= stbPts)
        && Math.abs(this.player1Points - this.player2Points) >= 2;
    }
    if (this.noAdvantage) {
      return this.player1Points >= 4 || this.player2Points >= 4;
    }
    return (this.player1Points >= 4 || this.player2Points >= 4)
      && Math.abs(this.player1Points - this.player2Points) >= 2;
  }

  isSetWon() {
    if (this.isTiebreak || this.isSuperTiebreak) {
      return false;
    }

    const gps = this.matchConfig.gamesPerSet;
    if (gps <= 3) {
      return this.player1Games >= gps || this.player2Games >= gps;
    }

    if (
      (this.player1Games >= gps && this.player1Games - this.player2Games >= 2)
      || (this.player2Games >= gps && this.player2Games - this.player1Games >= 2)
    ) {
      return true;
    }

    const gpsPlus1 = gps + 1;
    const gpsMinus1 = gps - 1;
    return (
      (this.player1Games === gpsPlus1 && this.player2Games === gpsMinus1)
      || (this.player2Games === gpsPlus1 && this.player1Games === gpsMinus1)
    );
  }

  shouldStartTiebreak() {
    const gps = this.matchConfig.gamesPerSet;
    const tbTrigger = gps <= 3 ? gps - 1 : gps;
    return this.player1Games === tbTrigger
      && this.player2Games === tbTrigger
      && !this.isTiebreak
      && !this.isSuperTiebreak;
  }

  shouldEndMatch() {
    return this.player1Sets === this.matchConfig.setsToWin
      || this.player2Sets === this.matchConfig.setsToWin;
  }
}

function formatTeamDisplay(primaryPlayer, partnerPlayer, isPrimaryServer, isPartnerServer) {
  if (partnerPlayer == null) {
    return markServer(primaryPlayer.getDisplayName(), isPrimaryServer);
  }
  return [
    markServer(primaryPlayer.getDisplayName(), isPrimaryServer),
    markServer(partnerPlayer.getDisplayName(), isPartnerServer),
  ].join(' / ');
}

function markServer(name, isServer) {
  return isServer ? `🎾 ${name}` : name;
}

function getPointsDisplay(points, opponentPoints, isTiebreakMode, noAdvantage) {
  if (isTiebreakMode) {
    return String(points);
  }
  if (noAdvantage) {
    if (points === 0) return '0';
    if (points === 1) return '15';
    if (points === 2) return '30';
    return '40';
  }
  if (points >= 3 && opponentPoints >= 3) {
    if (points === opponentPoints) return '40';
    if (points > opponentPoints) return 'ADV';
    return '40';
  }
  if (points === 0) return '0';
  if (points === 1) return '15';
  if (points === 2) return '30';
  return '40';
}

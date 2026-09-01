import { SetScore } from './models.js';

export function directorCommandDto({
  id = null,
  seq = null,
  type = null,
  matchId = null,
  clientMatchUuid = null,
  courtId = null,
  courtName = null,
  courtToken = null,
  courtTokenExpiresAt = null,
  player1Name = null,
  player2Name = null,
  score = null,
  matchConfig = null,
} = {}) {
  return {
    id,
    seq,
    type,
    matchId,
    clientMatchUuid,
    courtId,
    courtName,
    courtToken,
    courtTokenExpiresAt,
    player1Name,
    player2Name,
    score,
    matchConfig,
  };
}

export function directorScoreDto(fields = {}) {
  return {
    player1Sets: fields.player1Sets ?? null,
    player2Sets: fields.player2Sets ?? null,
    player1Games: fields.player1Games ?? null,
    player2Games: fields.player2Games ?? null,
    player1Points: fields.player1Points ?? null,
    player2Points: fields.player2Points ?? null,
    setsHistory: fields.setsHistory ?? null,
    isTiebreak: fields.isTiebreak ?? null,
    isSuperTiebreak: fields.isSuperTiebreak ?? null,
    isPlayer1Serving: fields.isPlayer1Serving ?? null,
  };
}

export function matchConfigDto(fields = {}) {
  return {
    gamesPerSet: fields.gamesPerSet ?? null,
    setsToWin: fields.setsToWin ?? null,
    tiebreakPoints: fields.tiebreakPoints ?? null,
    superTiebreakPoints: fields.superTiebreakPoints ?? null,
    noAdvantage: fields.noAdvantage ?? null,
    tiebreakOnly: fields.tiebreakOnly ?? null,
    statsMode: fields.statsMode ?? null,
  };
}

export function setScoreDtoToModel(dto) {
  return new SetScore({
    setNumber: dto.setNumber,
    player1Games: dto.player1Games,
    player2Games: dto.player2Games,
    tiebreakLoserPoints: dto.tiebreakLoserPoints ?? null,
    isSuperTiebreak: dto.isSuperTiebreak ?? false,
  });
}

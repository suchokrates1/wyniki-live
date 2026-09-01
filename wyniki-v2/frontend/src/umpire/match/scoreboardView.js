export function countryFlag(countryCode) {
  if (!countryCode || String(countryCode).length !== 2) return '';
  const upper = String(countryCode).toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  return String.fromCodePoint(
    ...[...upper].map((char) => 0x1F1E6 + char.charCodeAt(0) - 65),
  );
}

export function formatSetScore(games, opponentGames, tiebreakLoserPoints) {
  const suffix = tiebreakLoserPoints != null && games < opponentGames
    ? `(${tiebreakLoserPoints})`
    : '';
  return `${games}${suffix}`;
}

function setColumn(state, index) {
  const history = state.setsHistory || [];
  if (history.length === index) {
    return {
      p1: String(state.player1Games),
      p2: String(state.player2Games),
      active: true,
    };
  }
  if (history.length > index) {
    const set = history[index];
    return {
      p1: formatSetScore(set.player1Games, set.player2Games, set.tiebreakLoserPoints),
      p2: formatSetScore(set.player2Games, set.player1Games, set.tiebreakLoserPoints),
      active: false,
    };
  }
  return { p1: '0', p2: '0', active: false };
}

export function buildScoreboard(state) {
  const doubles = Boolean(state.isDoubles);
  return {
    p1Flag: doubles ? '👥' : countryFlag(state.player1?.flag),
    p2Flag: doubles ? '👥' : countryFlag(state.player2?.flag),
    p1Name: doubles ? state.getTeam1ServerAwareDisplayName() : state.player1.getDisplayName(),
    p2Name: doubles ? state.getTeam2ServerAwareDisplayName() : state.player2.getDisplayName(),
    p1Serving: !doubles && state.isPlayer1Serving,
    p2Serving: !doubles && !state.isPlayer1Serving,
    p1Points: state.getPlayer1PointsDisplay(),
    p2Points: state.getPlayer2PointsDisplay(),
    set1: setColumn(state, 0),
    set2: setColumn(state, 1),
    matchType: state.isMixedDoubles ? 'mixed' : (state.isDoubles ? 'doubles' : 'singles'),
    umpireName: state.umpireName || '',
    gameMode: state.isSuperTiebreak
      ? 'super_tiebreak'
      : (state.isTiebreak ? 'tiebreak' : null),
    gameModePoints: state.isSuperTiebreak
      ? state.matchConfig.superTiebreakPoints
      : state.matchConfig.tiebreakPoints,
  };
}

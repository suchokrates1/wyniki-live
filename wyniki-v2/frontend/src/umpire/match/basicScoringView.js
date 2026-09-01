export function isServerOnLeft(state) {
  return (state.isPlayer1Serving && !state.sidesSwapped)
    || (!state.isPlayer1Serving && state.sidesSwapped);
}

export function leftIsPlayer1(state) {
  return !state.sidesSwapped;
}

export function courtSideNames(state) {
  if (state.isDoubles) {
    return {
      left: state.sidesSwapped
        ? state.getTeam2ServerAwareDisplayName()
        : state.getTeam1ServerAwareDisplayName(),
      right: state.sidesSwapped
        ? state.getTeam1ServerAwareDisplayName()
        : state.getTeam2ServerAwareDisplayName(),
    };
  }
  return {
    left: (state.sidesSwapped ? state.player2 : state.player1).getDisplayName(),
    right: (state.sidesSwapped ? state.player1 : state.player2).getDisplayName(),
  };
}

export function buildBasicScoring(state) {
  const serverLeft = isServerOnLeft(state);
  const names = courtSideNames(state);
  return {
    leftName: names.left,
    rightName: names.right,
    leftIsPlayer1: leftIsPlayer1(state),
    rightIsPlayer1: !leftIsPlayer1(state),
    serverOnLeft: serverLeft,
    showServerLeft: serverLeft,
    showReceiverLeft: !serverLeft,
    showServerRight: !serverLeft,
    showReceiverRight: serverLeft,
    isFirstServe: state.isFirstServe,
    faultKind: state.isFirstServe ? 'second' : 'double',
    serveInfoKey: state.isFirstServe ? 'firstServe' : 'secondServe',
  };
}

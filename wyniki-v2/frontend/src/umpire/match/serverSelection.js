export const ButtonColorRole = Object.freeze({
  Singles: 'Singles',
  Team1: 'Team1',
  Team2: 'Team2',
});

export function resolveServerNumber(buttonIndex, state) {
  return state.isDoubles
    ? resolveDoublesServerNumber(buttonIndex, state.sidesSwapped)
    : resolveSinglesServerNumber(buttonIndex, state.sidesSwapped);
}

export function buildServerButtons(state) {
  return state.isDoubles ? buildDoublesButtonStates(state) : buildSinglesButtonStates(state);
}

function resolveSinglesServerNumber(buttonIndex, sidesSwapped) {
  if (buttonIndex === 1) return sidesSwapped ? 2 : 1;
  if (buttonIndex === 2) return sidesSwapped ? 1 : 2;
  return 1;
}

function resolveDoublesServerNumber(buttonIndex, sidesSwapped) {
  if (buttonIndex === 1) return sidesSwapped ? 2 : 1;
  if (buttonIndex === 2) return sidesSwapped ? 1 : 2;
  if (buttonIndex === 3) return sidesSwapped ? 4 : 3;
  if (buttonIndex === 4) return sidesSwapped ? 3 : 4;
  return 1;
}

function buildSinglesButtonStates(state) {
  const leftServerNumber = state.sidesSwapped ? 2 : 1;
  const rightServerNumber = state.sidesSwapped ? 1 : 2;
  const leftPlayer = state.sidesSwapped ? state.player2 : state.player1;
  const rightPlayer = state.sidesSwapped ? state.player1 : state.player2;
  return [
    buttonState(1, leftServerNumber, leftPlayer, state, false, ButtonColorRole.Singles),
    buttonState(2, rightServerNumber, rightPlayer, state, false, ButtonColorRole.Singles),
    hiddenButtonState(3),
    hiddenButtonState(4),
  ];
}

function buildDoublesButtonStates(state) {
  const leftTop = state.sidesSwapped
    ? [2, state.player2]
    : [1, state.player1];
  const rightTop = state.sidesSwapped
    ? [1, state.player1]
    : [2, state.player2];
  const leftBottom = state.sidesSwapped
    ? [4, state.player4 || state.player2]
    : [3, state.player3 || state.player1];
  const rightBottom = state.sidesSwapped
    ? [3, state.player3 || state.player1]
    : [4, state.player4 || state.player2];
  return [
    doublesButtonState(1, leftTop[0], leftTop[1], state),
    doublesButtonState(2, rightTop[0], rightTop[1], state),
    doublesButtonState(3, leftBottom[0], leftBottom[1], state),
    doublesButtonState(4, rightBottom[0], rightBottom[1], state),
  ];
}

function doublesButtonState(buttonIndex, serverNumber, player, state) {
  const colorRole = serverNumber === 1 || serverNumber === 3
    ? ButtonColorRole.Team1
    : ButtonColorRole.Team2;
  return buttonState(buttonIndex, serverNumber, player, state, true, colorRole);
}

function buttonState(buttonIndex, serverNumber, player, state, isDoubles, colorRole) {
  const selected = state.currentServer === serverNumber;
  return {
    buttonIndex,
    serverNumber,
    label: playerLabel(player, selected, isDoubles),
    visible: true,
    selected,
    colorRole,
  };
}

function hiddenButtonState(buttonIndex) {
  return {
    buttonIndex,
    serverNumber: buttonIndex,
    label: '',
    visible: false,
    selected: false,
    colorRole: ButtonColorRole.Singles,
  };
}

function playerLabel(player, selected, isDoubles) {
  const prefix = selected ? (isDoubles ? '🎾 ' : '• ') : '';
  const gender = player?.getGenderShortLabel?.();
  const genderLabel = gender ? `${gender} ` : '';
  const name = player?.getDisplayName?.() || '';
  return `${prefix}${genderLabel}${name}`;
}

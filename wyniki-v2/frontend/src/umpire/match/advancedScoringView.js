import { courtSideNames, isServerOnLeft, leftIsPlayer1 } from './basicScoringView.js';

export function buildAdvancedServe(state) {
  const serverLeft = isServerOnLeft(state);
  const names = courtSideNames(state);
  return {
    leftName: names.left,
    rightName: names.right,
    leftIsPlayer1: leftIsPlayer1(state),
    rightIsPlayer1: !leftIsPlayer1(state),
    serverOnLeft: serverLeft,
    showServeLeft: serverLeft,
    showServeRight: !serverLeft,
    isFirstServe: state.isFirstServe,
    serveInfoKey: state.isFirstServe ? 'firstServe' : 'secondServe',
  };
}

export function buildAdvancedRally(state) {
  const names = courtSideNames(state);
  return {
    leftName: names.left,
    rightName: names.right,
    leftIsPlayer1: leftIsPlayer1(state),
    rightIsPlayer1: !leftIsPlayer1(state),
  };
}

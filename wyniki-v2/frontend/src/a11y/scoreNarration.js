import { formatTemplate } from '../shared/text.js';

export function spokenScore(accessibilityText = {}, left, right) {
  return `${left} ${accessibilityText.scoreJoiner || ':'} ${right}`;
}

export function describeSpeechSet(accessibilityText = {}, set, index = 0) {
  if (!set) return '';
  const left = Number(set.left ?? 0);
  const right = Number(set.right ?? 0);

  if (set.stb) {
    return `${accessibilityText.superTieBreak || 'super tie-break'}, ${spokenScore(accessibilityText, left, right)}`;
  }

  const label = formatTemplate(accessibilityText.set || 'Set {number}', { number: index + 1 });
  let spoken = `${label}, ${spokenScore(accessibilityText, left, right)}`;

  if (set.tb !== null && set.tb !== undefined) {
    const tieBreakLoser = Number(set.tb ?? 0);
    const tieBreakWinner = Math.max(7, tieBreakLoser + 2);
    const tbLeft = left > right ? tieBreakWinner : tieBreakLoser;
    const tbRight = right > left ? tieBreakWinner : tieBreakLoser;
    spoken += `, ${accessibilityText.tieBreak || 'tie-break'} ${spokenScore(accessibilityText, tbLeft, tbRight)}`;
  }

  return spoken;
}

export function describeSpeechSetSequence(accessibilityText = {}, sets = []) {
  const visibleSets = (sets || []).filter((set, index) => {
    if (!set) return false;
    if (set.stb) return true;
    return index === 0 || Number(set.left ?? 0) > 0 || Number(set.right ?? 0) > 0;
  });

  if (!visibleSets.length) {
    return accessibilityText.scorePending || 'wynik nie jest jeszcze dostepny';
  }

  return visibleSets
    .map((set, index) => describeSpeechSet(accessibilityText, set, index))
    .filter(Boolean)
    .join('. ');
}
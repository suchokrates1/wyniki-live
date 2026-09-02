import script from './script.json' with { type: 'json' };

export function tutorialScript() {
  return script;
}

export function tutorialStepAt(index) {
  return script.steps[index] || null;
}

export function tutorialCanAdvance(step, actionSatisfied) {
  if (!step) return false;
  if (!step.requireAction) return true;
  return Boolean(actionSatisfied);
}

export function tutorialNextIndex(index) {
  return Math.min(index + 1, script.steps.length - 1);
}

export function tutorialPrevIndex(index) {
  return Math.max(index - 1, 0);
}

export function tutorialIsLast(index) {
  return index >= script.steps.length - 1;
}

export function tutorialMatchesAction(step, action) {
  return Boolean(step?.requireAction) && step.requireAction === action;
}

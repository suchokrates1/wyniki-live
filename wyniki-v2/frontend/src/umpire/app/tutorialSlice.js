import { TUTORIAL_COURT_1 } from '../tutorial/catalog.js';
import { loadTutorialSnapshot } from '../tutorial/presets.js';
import {
  tutorialCanAdvance,
  tutorialIsLast,
  tutorialMatchesAction,
  tutorialNextIndex,
  tutorialPrevIndex,
  tutorialStepAt,
} from '../tutorial/tutorialController.js';

export function createUmpireTutorialSlice({ session }) {
  return {
    tutorialStep() {
      return this.tutorialMode ? tutorialStepAt(this.tutorialStepIndex) : null;
    },

    tutorialBubble() {
      const step = this.tutorialStep();
      if (!step) return null;
      return {
        title: this.t(step.titleKey),
        body: this.t(step.bodyKey),
        canBack: this.tutorialStepIndex > 0,
        canNext: tutorialCanAdvance(step, this.tutorialActionOk),
        isLast: tutorialIsLast(this.tutorialStepIndex),
        target: step.target,
      };
    },

    maybeShowTutorialBanner() {
      this.tutorialBanner = !this.tutorialMode
        && !session.tutorialDone()
        && !session.tutorialPrompted()
        && (this.screen === 'language' || this.screen === 'court' || this.screen === 'tournament');
    },

    acceptTutorialBanner() {
      session.markTutorialPrompted();
      this.tutorialBanner = false;
      this.startTutorial();
    },

    dismissTutorialBanner() {
      session.markTutorialPrompted();
      this.tutorialBanner = false;
    },

    startTutorial() {
      session.setTutorialMode(true);
      session.markTutorialPrompted();
      this.tutorialMode = true;
      this.tutorialStepIndex = 0;
      this.tutorialActionOk = false;
      this.tutorialReturnScreen = this.screen === 'settings' ? 'settings' : 'court';
      this.tutorialCourtSession = null;
      this.tutorialBanner = false;
      this.selectedIds = [];
      this.isDoubles = false;
      this.dialog = null;
      this.finishStep = null;
      this.closePin();
      this.applyTutorialStep();
    },

    exitTutorial() {
      session.setTutorialMode(false);
      session.markTutorialDone();
      this.tutorialMode = false;
      this.tutorialActionOk = false;
      this.tutorialCourtSession = null;
      this.tutorialBanner = false;
      this.dialog = null;
      this.finishStep = null;
      this.closePin();
      this.go(this.tutorialReturnScreen || 'settings');
    },

    tutorialNote(action) {
      const step = this.tutorialStep();
      if (!tutorialMatchesAction(step, action)) return;
      this.tutorialActionOk = true;
      this.tutorialNext();
    },

    tutorialNext() {
      const step = this.tutorialStep();
      if (!tutorialCanAdvance(step, this.tutorialActionOk)) return;
      if (tutorialIsLast(this.tutorialStepIndex)) {
        this.exitTutorial();
        return;
      }
      this.tutorialStepIndex = tutorialNextIndex(this.tutorialStepIndex);
      this.tutorialActionOk = !tutorialStepAt(this.tutorialStepIndex)?.requireAction;
      this.applyTutorialStep();
    },

    tutorialBack() {
      if (this.tutorialStepIndex <= 0) {
        this.exitTutorial();
        return;
      }
      this.tutorialStepIndex = tutorialPrevIndex(this.tutorialStepIndex);
      this.tutorialActionOk = !tutorialStepAt(this.tutorialStepIndex)?.requireAction;
      this.applyTutorialStep();
    },

    applyTutorialStep() {
      const step = this.tutorialStep();
      if (!step) return;
      this.dialog = null;
      if (step.snapshot) {
        const preset = loadTutorialSnapshot(step.snapshot, (key) => this.t(key));
        if (preset) {
          this.match.restoreSnapshot(preset);
          this.go('match');
        }
      } else if (step.scene === 'court' || step.scene === 'pin') {
        this.go('court');
        if (step.scene === 'pin') {
          const court = this.courts.find((item) => (item.kort_id || item.id) === TUTORIAL_COURT_1) || this.courts[0];
          if (court) this.openPin(court);
        } else {
          this.closePin();
        }
      } else if (step.scene === 'players') {
        this.closePin();
        this.go('players');
      } else if (step.scene === 'config') {
        this.openConfig();
      } else if (step.scene === 'finish') {
        this.go('match');
      }
      if (step.id === 'finish') this.dialog = null;
      if (step.id === 'retirement') {
        this.finishStep = 'reason';
        this.dialog = 'finish';
      }
    },
  };
}

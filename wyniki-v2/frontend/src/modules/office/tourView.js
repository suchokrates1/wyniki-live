/**
 * The office guide: bubbles next to the controls, step by step through setting up a
 * tournament (categories, groups, form of play, schedule, notes). It never blocks the page:
 * the office clicks what the bubble points at and moves on with "Dalej".
 */
export const OFFICE_TOUR_STEPS = [
  { id: 'categories', view: 'groups', targets: ['[data-tour="category-setup"]', '[data-tour="categories"]'] },
  { id: 'players', view: 'groups', targets: ['[data-tour="add-player"]'] },
  { id: 'divisions', view: 'groups', targets: ['[data-tour="divisions"]'] },
  { id: 'groups', view: 'groups', targets: ['[data-tour="group-count"]'] },
  { id: 'formats', view: 'draws', targets: ['[data-tour="formats"]'] },
  { id: 'formatConfirm', view: 'draws', targets: ['[data-tour="draw-confirm"]'] },
  { id: 'b1Courts', view: 'planning', targets: ['[data-tour="b1-court"]'] },
  { id: 'generate', view: 'planning', targets: ['[data-tour="generate"]'] },
  { id: 'hours', view: 'planning', targets: ['[data-tour="day-hours"]'] },
  { id: 'autoPlan', view: 'planning', targets: ['[data-tour="auto-plan"]'] },
  { id: 'days', view: 'planning', targets: ['[data-tour="day-tabs"]'] },
  { id: 'drag', view: 'planning', targets: ['[data-tour="drawer"]'] },
  { id: 'publish', view: 'planning', targets: ['[data-tour="approve"]', '[data-tour="publish"]'] },
  { id: 'notesOpen', view: 'planning', targets: ['[data-tour="notes-open"]'] },
  { id: 'notes', view: 'quickinfo', targets: ['[data-tour="schedule-notes"]'] },
];

const BUBBLE_WIDTH = 340;

function visible(node) {
  if (!node) return false;
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

export function createOfficeTourView() {
  return {
    tourActive: false,
    tourIndex: 0,
    tourTargetFound: false,
    tourRing: null,
    tourBubbleStyle: '',
    tourOfferDismissTick: 0,
    tourFrame: null,
    tourListenersOn: false,

    tourSteps() {
      return OFFICE_TOUR_STEPS;
    },

    tourStep() {
      return OFFICE_TOUR_STEPS[this.tourIndex] || null;
    },

    tourKey(suffix) {
      return `office-tour-${suffix}-t${this.officeTournamentId || this.slot}`;
    },

    /** A fresh tournament (nothing set up yet) offers the guide once. */
    tourOfferVisible() {
      void this.tourOfferDismissTick;
      if (this.tourActive || !this.planningLoadedOnce || (this.tournamentCategories || []).length) return false;
      try {
        return window.localStorage.getItem(this.tourKey('offer')) !== 'dismissed';
      } catch {
        return true;
      }
    },

    dismissTourOffer() {
      try {
        window.localStorage.setItem(this.tourKey('offer'), 'dismissed');
      } catch {
        // private mode: hidden until the next reload
      }
      this.tourOfferDismissTick += 1;
    },

    async startTour(index = 0) {
      this.dismissTourOffer();
      this.tourActive = true;
      this.bindTourListeners();
      await this.showTourStep(index);
    },

    async showTourStep(index) {
      const step = OFFICE_TOUR_STEPS[index];
      if (!step) {
        this.endTour();
        return;
      }
      this.tourIndex = index;
      if (step.view && this.activeTab !== step.view) await this.openOfficeView(step.view, { auto: true });
      // views slide in and data may still load: look for the control a few times
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (this.tourIndex !== index || !this.tourActive) return;
        if (this.tourTarget()) break;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const target = this.tourTarget();
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      window.setTimeout(() => this.placeTour(), 260);
      this.placeTour();
    },

    tourTarget() {
      const step = this.tourStep();
      if (!step) return null;
      for (const selector of step.targets) {
        const node = [...document.querySelectorAll(selector)].find(visible);
        if (node) return node;
      }
      return null;
    },

    placeTour() {
      if (!this.tourActive) return;
      const target = this.tourTarget();
      this.tourTargetFound = Boolean(target);
      const width = Math.min(BUBBLE_WIDTH, window.innerWidth - 24);
      if (!target) {
        this.tourRing = null;
        this.tourBubbleStyle = `width: ${width}px; right: 24px; bottom: 24px;`;
        return;
      }
      const rect = target.getBoundingClientRect();
      const pad = 6;
      this.tourRing = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
      const bubble = document.querySelector('[data-tour-bubble]');
      const height = bubble?.offsetHeight || 220;
      let left;
      let top;
      if (rect.right + 18 + width <= window.innerWidth - 12) {
        left = rect.right + 18;
        top = rect.top;
      } else if (rect.left - 18 - width >= 12) {
        left = rect.left - 18 - width;
        top = rect.top;
      } else {
        left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
        top = rect.bottom + 14 + height <= window.innerHeight - 12 ? rect.bottom + 14 : rect.top - 14 - height;
      }
      top = Math.min(Math.max(12, top), window.innerHeight - height - 12);
      this.tourBubbleStyle = `width: ${width}px; left: ${Math.round(left)}px; top: ${Math.round(top)}px;`;
    },

    tourRingStyle() {
      const ring = this.tourRing;
      return ring ? `top: ${ring.top}px; left: ${ring.left}px; width: ${ring.width}px; height: ${ring.height}px;` : '';
    },

    bindTourListeners() {
      if (this.tourListenersOn) return;
      this.tourListenersOn = true;
      const schedule = () => {
        if (!this.tourActive) return;
        window.cancelAnimationFrame(this.tourFrame);
        this.tourFrame = window.requestAnimationFrame(() => this.placeTour());
      };
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      window.addEventListener('keydown', (event) => {
        if (!this.tourActive) return;
        if (event.key === 'Escape') this.endTour();
      });
      // the page keeps changing under the bubble (data loads, drawers open)
      window.setInterval(() => { if (this.tourActive) this.placeTour(); }, 700);
    },

    nextTourStep() {
      if (this.tourIndex >= OFFICE_TOUR_STEPS.length - 1) {
        this.endTour();
        return;
      }
      this.showTourStep(this.tourIndex + 1);
    },

    previousTourStep() {
      if (this.tourIndex > 0) this.showTourStep(this.tourIndex - 1);
    },

    endTour() {
      this.tourActive = false;
      this.tourRing = null;
    },

    tourText(field) {
      const step = this.tourStep();
      return step ? this.ot(`tour.steps.${step.id}.${field}`) : '';
    },
  };
}

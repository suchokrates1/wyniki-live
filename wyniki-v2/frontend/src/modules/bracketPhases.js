// The phone view of a tree: tabs over a strip of phases. A tap on a tab slides the strip;
// a swipe left or right moves one phase, the strip following the finger and resisting at the ends.

const SWIPE = 60;

export function registerBracketPhases(Alpine) {
  Alpine.data('bracketPhases', (count = 1, start = 0) => ({
    index: Math.min(Math.max(0, start), Math.max(0, count - 1)),
    dragging: false,
    dx: 0,
    startX: 0,
    startY: 0,
    horizontal: null,

    go(next) {
      this.index = Math.min(Math.max(0, next), count - 1);
    },

    down(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.dragging = true;
      this.horizontal = null;
      this.dx = 0;
      this.startX = event.clientX;
      this.startY = event.clientY;
    },

    move(event) {
      if (!this.dragging) return;
      const dx = event.clientX - this.startX;
      const dy = event.clientY - this.startY;
      if (this.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) this.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!this.horizontal) return;
      const atEdge = (this.index === 0 && dx > 0) || (this.index === count - 1 && dx < 0);
      this.dx = atEdge ? dx * 0.3 : dx;
    },

    up() {
      if (!this.dragging) return;
      if (this.horizontal && this.dx <= -SWIPE) this.go(this.index + 1);
      if (this.horizontal && this.dx >= SWIPE) this.go(this.index - 1);
      this.dragging = false;
      this.dx = 0;
    },

    trackStyle() {
      return `transform: translateX(calc(${-this.index * 100}% + ${this.dragging ? this.dx : 0}px))`;
    },

    barStyle() {
      return `width: ${100 / count}%; left: ${(100 / count) * this.index}%`;
    },
  }));
}

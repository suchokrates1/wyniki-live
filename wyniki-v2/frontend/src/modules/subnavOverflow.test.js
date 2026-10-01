import assert from 'node:assert/strict';
import test from 'node:test';
import { subnavOverflowState, subnavRevealDelta } from './subnavOverflow.js';

test('a row that fits shows no scroll hint', () => {
  assert.deepEqual(subnavOverflowState({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }), {
    start: false,
    end: false,
  });
});

test('a phone row hides the day plan until you scroll, so the end fades', () => {
  assert.deepEqual(subnavOverflowState({ scrollLeft: 0, scrollWidth: 480, clientWidth: 336 }), {
    start: false,
    end: true,
  });
});

test('scrolled to the last tab, the fade moves to the start', () => {
  assert.deepEqual(subnavOverflowState({ scrollLeft: 144, scrollWidth: 480, clientWidth: 336 }), {
    start: true,
    end: false,
  });
});

test('the open tab scrolls into the row without moving tabs that already fit', () => {
  assert.equal(subnavRevealDelta({ scrollLeft: 0, clientWidth: 336, tabLeft: 280, tabWidth: 120 }), 64);
  assert.equal(subnavRevealDelta({ scrollLeft: 80, clientWidth: 336, tabLeft: 40, tabWidth: 100 }), -40);
  assert.equal(subnavRevealDelta({ scrollLeft: 0, clientWidth: 336, tabLeft: 20, tabWidth: 100 }), 0);
});

test('mid-scroll fades both edges', () => {
  assert.deepEqual(subnavOverflowState({ scrollLeft: 40, scrollWidth: 480, clientWidth: 336 }), {
    start: true,
    end: true,
  });
});

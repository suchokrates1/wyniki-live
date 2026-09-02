import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  overlayCategoryLabel,
  overlayCourtLabel,
  overlayMetaParts,
  overlayPhaseLabel,
} from './overlayLabel.js';

test('court labels become English COURT N', () => {
  assert.equal(overlayCourtLabel('Kort 1', 't31-1'), 'COURT 1');
  assert.equal(overlayCourtLabel('KORT 2', '2'), 'COURT 2');
  assert.equal(overlayCourtLabel('Court 8', '8'), 'COURT 8');
  assert.equal(overlayCourtLabel('Open • Kort 16', 't31-16'), 'COURT 16');
  assert.equal(overlayCourtLabel('MAIN', '1'), 'MAIN');
  assert.equal(overlayCourtLabel('', 't31-4'), 'COURT 4');
});

test('categories become English B1 Women / B1 Men', () => {
  assert.equal(overlayCategoryLabel('B1 Kobiety'), 'B1 Women');
  assert.equal(overlayCategoryLabel('B1 Mężczyźni'), 'B1 Men');
  assert.equal(overlayCategoryLabel('B4 Woman'), 'B4 Women');
  assert.equal(overlayCategoryLabel('B1 Men — Grupa A'), 'B1 Men');
  assert.equal(overlayCategoryLabel('B2 Debel'), 'B2 Doubles');
});

test('phases become compact English overlay tokens', () => {
  assert.equal(overlayPhaseLabel('Grupowa'), 'GROUP');
  assert.equal(overlayPhaseLabel('B1 Men — Ćwierćfinał'), '1/4');
  assert.equal(overlayPhaseLabel('Półfinał'), '1/2');
  assert.equal(overlayPhaseLabel('B1 Women — Finał'), 'FINAL');
  assert.equal(overlayPhaseLabel('1/8'), '1/8');
  assert.equal(overlayPhaseLabel('o 3. miejsce'), '3RD PLACE');
});

test('meta parts skip empty values', () => {
  assert.deepEqual(
    overlayMetaParts({ category: 'B1 Women', phase: 'Grupowa' }),
    ['B1 Women', 'GROUP'],
  );
  assert.deepEqual(overlayMetaParts({ phase: 'Finał' }), ['FINAL']);
  assert.deepEqual(overlayMetaParts({}), []);
});

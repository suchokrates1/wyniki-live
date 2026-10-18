import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  localizeScoreboardCategory,
  localizeScoreboardPhase,
  overlayCategoryLabel,
  overlayCourtLabel,
  overlayScoreLabels,
  overlayMetaParts,
  overlayPhaseLabel,
} from './overlayLabel.js';

test('court labels follow the tournament language and keep B codes out of the name', () => {
  assert.equal(overlayCourtLabel('Kort 1', 't31-1', 'pl'), 'Kort 1');
  assert.equal(overlayCourtLabel('1', 't31-1', 'en'), 'Court 1');
  assert.equal(overlayCourtLabel('KORT 2', '2', 'de'), 'Platz 2');
  assert.equal(overlayCourtLabel('', 't31-4', 'lt'), 'Kortas 4');
  assert.equal(overlayCourtLabel('MAIN', '1', 'pl'), 'MAIN');
  assert.equal(overlayCourtLabel('Open • Kort 16', 't31-16', 'es'), 'Cancha 16');
});

test('B1 and B4 stay while the surrounding words follow the tournament', () => {
  const polish = overlayScoreLabels('pl');
  assert.equal(localizeScoreboardCategory('B1 Women', polish), 'B1 Kobiety');
  assert.equal(localizeScoreboardCategory('B4 Men', polish), 'B4 Mężczyźni');
  assert.equal(localizeScoreboardPhase('Finał', polish), 'Finał');
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

test('homepage labels translate leftover English overlay tokens', () => {
  const pl = {
    group: 'Grupowa',
    women: 'Kobiety',
    men: 'Mężczyźni',
  };
  assert.equal(localizeScoreboardPhase('GROUP', pl), 'Grupowa');
  assert.equal(localizeScoreboardPhase('Grupowa', pl), 'Grupowa');
  assert.equal(localizeScoreboardPhase('1/4', { qf: 'Ćwierćfinał' }), 'Ćwierćfinał');
  assert.equal(localizeScoreboardPhase('Półfinał', { sf: 'Półfinał' }), 'Półfinał');
  assert.equal(localizeScoreboardCategory('B1 Women', pl), 'B1 Kobiety');
  assert.equal(localizeScoreboardCategory('B1 Kobiety', pl), 'B1 Kobiety');
});

test('meta parts skip empty values', () => {
  assert.deepEqual(
    overlayMetaParts({ category: 'B1 Women', phase: 'Grupowa' }),
    ['B1 Women', 'GROUP'],
  );
  assert.deepEqual(overlayMetaParts({ phase: 'Finał' }), ['FINAL']);
  assert.deepEqual(overlayMetaParts({}), []);
});

test('generated draw phases get overlay labels', () => {
  assert.equal(overlayPhaseLabel('B1 Men — 1/8 finału'), '1/8');
  assert.equal(overlayPhaseLabel('B2 Men — o miejsca 5–8'), 'PLACES 5–8');
  assert.equal(overlayPhaseLabel('B1 Men — o 13. miejsce'), '13TH PLACE');
  assert.equal(overlayPhaseLabel('B1 Men — o 3. miejsce'), '3RD PLACE');
  assert.equal(overlayPhaseLabel('B2 Men — Pocieszenie Finał'), 'CONSOLATION FINAL');
  assert.equal(overlayPhaseLabel('B2 Men — Pocieszenie o 7. miejsce'), 'CONSOLATION 7TH PLACE');
});

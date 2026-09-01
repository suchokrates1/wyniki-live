import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateStoredScheduleLabel } from './labelDisplay.js';

const LT_LABELS = {
  women: 'Moterys',
  men: 'Vyrai',
  mixed: 'B3/4 Mixed',
  semifinal: 'Pusfinalis',
  final: 'Finalas',
  placeFor: 'dėl {number} vietos',
  group: 'Grupių etapas',
  groupRematch: 'Grupių etapas — revanšas',
  knockout: 'Atkrintamosios',
  groupSuffixLetter: 'Grupė {letter}',
  winnerSf: 'PF {number} nugalėtojas',
  loserSf: 'PF {number} pralaimėtojas',
};

test('maps canonical Polish DB phase labels into Lithuanian UI terms', () => {
  assert.equal(translateStoredScheduleLabel('Grupowa', LT_LABELS), 'Grupių etapas');
  assert.equal(translateStoredScheduleLabel('Pucharowa', LT_LABELS), 'Atkrintamosios');
  assert.equal(translateStoredScheduleLabel('Półfinał', LT_LABELS), 'Pusfinalis');
  assert.equal(translateStoredScheduleLabel('B1 Mężczyźni — Finał', LT_LABELS), 'B1 Vyrai — Finalas');
  assert.equal(translateStoredScheduleLabel('B1 Men Doubles', { ...LT_LABELS, doubles: 'Dvejetai' }), 'B1 Men Dvejetai');
  assert.equal(translateStoredScheduleLabel('o 3. miejsce', LT_LABELS), 'dėl 3 vietos');
  assert.equal(translateStoredScheduleLabel('Grupa A', LT_LABELS), 'Grupė A');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateResultNote, translateStoredScheduleLabel } from './labelDisplay.js';

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

test('generated draw labels are translated', () => {
  const en = {
    semifinal: 'Semifinal', final: 'Final', placeFor: 'Match for place {number}', quarterfinal: 'Quarterfinal',
    roundOf: 'Round of {players}', placesRange: 'Places {from}–{to}', consolation: 'Consolation',
    winnerOf: 'Winner of {match}', loserOf: 'Loser of {match}', men: 'Men',
  };
  assert.equal(translateStoredScheduleLabel('B1 Men — 1/8 finału', en), 'B1 Men — Round of 16');
  assert.equal(translateStoredScheduleLabel('B2 Men — o miejsca 5–8', en), 'B2 Men — Places 5–8');
  assert.equal(translateStoredScheduleLabel('B2 Men — Pocieszenie Ćwierćfinał', en), 'B2 Men — Consolation Quarterfinal');
  assert.equal(translateStoredScheduleLabel('Zwycięzca: Pocieszenie Półfinał 2', en), 'Winner of Consolation Semifinal 2');
  assert.equal(translateStoredScheduleLabel('Przegrany: o miejsca 9–16 1', en), 'Loser of Places 9–16 1');
  assert.equal(translateStoredScheduleLabel('B2 Men — Pocieszenie o 7. miejsce', en), 'B2 Men — Consolation Match for place 7');
});

test('pending final names are translated', () => {
  const en = { winnerSf: 'SF winner {number}', loserSf: 'SF loser {number}' };
  assert.equal(translateStoredScheduleLabel('Zwycięzca PF 1', en), 'SF winner 1');
  assert.equal(translateStoredScheduleLabel('Przegrany PF 2', en), 'SF loser 2');
});

test('finish notes stored in Polish are shown in the page language', () => {
  const en = { retirement: 'Retired: {name}', walkover: 'Walkover', test: 'Test match' };
  assert.equal(translateResultNote('Krecz: Maria Lewandowska', en), 'Retired: Maria Lewandowska');
  assert.equal(translateResultNote('Walkower', en), 'Walkover');
  assert.equal(translateResultNote('Mecz testowy', en), 'Test match');
  assert.equal(translateResultNote('kontuzja kolana', en), 'kontuzja kolana');
  assert.equal(translateResultNote('Krecz: Maria Lewandowska', {}), 'Krecz: Maria Lewandowska');
  assert.equal(translateResultNote('', en), '');
});

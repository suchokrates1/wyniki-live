import assert from 'node:assert/strict';
import test from 'node:test';
import { courtDisplayName, extractCourtOrdinal } from './courtDisplay.js';
import { umpireText } from './i18n.js';

test('extractCourtOrdinal reads Kort/Court/id forms', () => {
  assert.equal(extractCourtOrdinal('Kort 1'), '1');
  assert.equal(extractCourtOrdinal('Court 3'), '3');
  assert.equal(extractCourtOrdinal('t1-5'), '5');
  assert.equal(extractCourtOrdinal('Open • Kort 2'), '2');
});

test('courtDisplayName localizes like Android', () => {
  const en = (n) => umpireText('en', 'courtName', { name: n });
  const pl = (n) => umpireText('pl', 'courtName', { name: n });
  const de = (n) => umpireText('de', 'courtName', { name: n });
  assert.equal(courtDisplayName('Kort 1', 't1-1', en), 'Court 1');
  assert.equal(courtDisplayName('Kort 1', 't1-1', pl), 'Kort 1');
  assert.equal(courtDisplayName('Kort 1', 't1-1', de), 'Platz 1');
  assert.equal(courtDisplayName(null, 't1-4', en), 'Court 4');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getCourtDisplayLabel, localizeCourtLabel } from './courtLabels.js';

const formats = {
  pl: (court) => `Kort ${court}`,
  en: (court) => `Court ${court}`,
  de: (court) => `Platz ${court}`,
  it: (court) => `Campo ${court}`,
  es: (court) => `Cancha ${court}`,
  fr: (court) => `Court ${court}`,
  lt: (court) => `Kortas ${court}`,
};

test('numeric court names pick up the current language prefix', () => {
  assert.equal(localizeCourtLabel('1', { forcePrefix: true, formatCourtLabel: formats.en }), 'Court 1');
  assert.equal(localizeCourtLabel('1', { forcePrefix: true, formatCourtLabel: formats.de }), 'Platz 1');
  assert.equal(localizeCourtLabel('1', { forcePrefix: true, formatCourtLabel: formats.lt }), 'Kortas 1');
  assert.equal(localizeCourtLabel('1', { forcePrefix: true, formatCourtLabel: formats.pl }), 'Kort 1');
});

test('stored Kort/Court/Kortas prefixes are rewritten for the UI language', () => {
  assert.equal(localizeCourtLabel('Kort 2', { formatCourtLabel: formats.en }), 'Court 2');
  assert.equal(localizeCourtLabel('Court 2', { formatCourtLabel: formats.pl }), 'Kort 2');
  assert.equal(localizeCourtLabel('Kortas 3', { formatCourtLabel: formats.de }), 'Platz 3');
  assert.equal(localizeCourtLabel('Platz 4 – Haupt', { formatCourtLabel: formats.en }), 'Court 4 – Haupt');
});

test('getCourtDisplayLabel uses court_name and the language formatter', () => {
  const courts = { 't1-1': { court_name: '1' } };
  assert.equal(getCourtDisplayLabel(courts, 't1-1', formats.en), 'Court 1');
  assert.equal(getCourtDisplayLabel(courts, 't1-1', formats.lt), 'Kortas 1');
});

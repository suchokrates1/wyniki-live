import assert from 'node:assert/strict';
import test from 'node:test';
import { pickSeriesLogo } from './seriesLogo.js';

const both = { logo_path: '/l.png', logo_dark_path: '/d.png' };

test('each theme takes its own version, plain', () => {
  assert.deepEqual(pickSeriesLogo(both, true), { src: '/d.png', plate: '' });
  assert.deepEqual(pickSeriesLogo(both, false), { src: '/l.png', plate: '' });
});

test('missing its version, a theme puts the other on a plate of its own ground', () => {
  assert.deepEqual(pickSeriesLogo({ logo_path: '/l.png' }, true), { src: '/l.png', plate: 'light' });
  assert.deepEqual(pickSeriesLogo({ logo_dark_path: '/d.png' }, false), { src: '/d.png', plate: 'dark' });
  assert.equal(pickSeriesLogo({}, true), null);
  assert.equal(pickSeriesLogo(null, false), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { statsPanelData } from './statsPanel.js';

const court = (overrides = {}) => ({
  A: { full_name: 'Jan Malicki' },
  B: { surname: 'Dutra' },
  stats: {
    player_a: { aces: 2, winners: 3, double_faults: 1, first_serve_pct: 61 },
    player_b: { aces: 0, forced_errors: 2, unforced_errors: 4 },
  },
  ...overrides,
});

test('a name sent by the umpire device cannot carry markup into the panel', () => {
  const data = statsPanelData(court({ A: { full_name: '<img src=x onerror=alert(1)>' } }), 'simple');
  assert.equal(data.nameA, '&lt;img src=x onerror=alert(1)&gt;');
});

test('a statistic that is not a number is escaped, not trusted', () => {
  const data = statsPanelData(court({
    stats: { player_a: { aces: '<b>9</b>', first_serves_in: '<i>', first_serves_total: 4 }, player_b: {} },
  }), 'advanced');
  const html = JSON.stringify(data);
  assert.ok(!html.includes('<b>') && !html.includes('<i>'));
  assert.equal(data.rows[0].a, '&lt;b&gt;9&lt;/b&gt;');
});

test('the shortened name is escaped after shortening', () => {
  const data = statsPanelData(court({ A: { full_name: 'A<b / C' } }), 'simple', (name) => name.toUpperCase());
  assert.equal(data.nameA, 'A&lt;B / C');
});

test('simple mode lists five rows, advanced adds serve detail and points won', () => {
  assert.deepEqual(statsPanelData(court(), 'simple').rows.map((row) => row.label),
    ['Asy', 'Podw. błędy', 'Winnery', 'Bł. niewymuszone', '1. serwis %']);
  const advanced = statsPanelData(court(), 'advanced');
  assert.equal(advanced.title, 'Statystyki zaawansowane');
  assert.equal(advanced.rows.length, 9);
  // A: 2 aces + 3 winners + B's 0 double faults + 2 forced + 4 unforced
  assert.deepEqual(advanced.rows.at(-1), { label: 'Pkt wygrane', a: '11', b: '1' });
});

test('points won ignore a statistic that is not a number', () => {
  const data = statsPanelData(court({ stats: { player_a: { aces: 'x', winners: 2 }, player_b: {} } }), 'advanced');
  assert.equal(data.rows.at(-1).a, '2');
});

test('a missing value shows a dash and a missing name the side letter', () => {
  const data = statsPanelData({ stats: {} }, 'simple');
  assert.equal(data.nameA, 'A');
  assert.equal(data.rows[0].a, '—');
});

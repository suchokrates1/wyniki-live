import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPlacings } from './finalPlacings.js';

test('final results group by category and drop rows without a known band', () => {
  const groups = groupPlacings([
    { name: 'Naqi Rizvi', category: 'B1', band: 'W' },
    { name: 'Carlos Arbos', category: 'B1', band: 'F' },
    { name: 'Anna', category: 'B2', band: 'SF' },
    { name: 'Nobody', category: 'B2', band: '' },
  ]);
  assert.deepEqual(groups.map((g) => [g.category, g.rows.map((r) => r.name)]), [['B1', ['Naqi Rizvi', 'Carlos Arbos']], ['B2', ['Anna']]]);
  assert.deepEqual(groupPlacings(), []);
});

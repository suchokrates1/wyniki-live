import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevicesListView, deviceMeta, deviceModel } from './devicesList.js';

test('the meta line carries court, app version and when it was last seen, as the API names them', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  assert.equal(
    deviceMeta({ last_court_id: 't32-1', app_version: '1.0.0-dev.38', model: 'Teclast P50Ai_ROW', last_seen: '2026-10-02T11:58:00Z' }, now),
    'kort t32-1 · 1.0.0-dev.38 · widziany 2 min temu',
  );
  assert.equal(deviceMeta({ last_seen: '2026-10-02T11:59:40Z' }, now), 'widziany teraz');
  assert.equal(deviceMeta({}), '');
});

test('a tablet seen hours ago gets a date instead of minutes', () => {
  const meta = deviceMeta({ last_seen: '2026-10-01T09:00:00Z' }, new Date('2026-10-02T12:00:00Z'));
  assert.match(meta, /01\.10/);
});

test('new tablets come first, with their own empty line', () => {
  const view = Object.assign({
    newDevices: () => [{ android_id: 'a' }],
    namedDevices: () => [],
  }, createDevicesListView());
  const buckets = view.adminDeviceBuckets();
  assert.deepEqual(buckets.map((bucket) => bucket.id), ['new', 'named']);
  assert.equal(buckets[0].rows.length, 1);
  assert.match(buckets[1].empty, /Jeszcze żaden tablet/);
  assert.deepEqual(view.adminDeviceBattery({ battery_level: 17 }), { text: '17%', tone: 'alert' });
});

test('the model stands on its own line, and says so when the tablet never sent one', () => {
  assert.equal(deviceModel({ model: 'Teclast P50Ai_ROW' }), 'Teclast P50Ai_ROW');
  assert.equal(deviceModel({}), 'Nieznany model');
});

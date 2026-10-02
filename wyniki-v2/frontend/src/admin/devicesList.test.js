import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevicesListView, deviceMeta } from './devicesList.js';

test('the meta line carries court, app version, model and when it was last seen', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  assert.equal(
    deviceMeta({ court_id: 't32-1', app_version: '1.0.0-dev.38', device_model: 'SM-X115', last_seen: '2026-10-02T11:58:00Z' }, now),
    'kort t32-1 · 1.0.0-dev.38 · SM-X115 · widziany 2 min temu',
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

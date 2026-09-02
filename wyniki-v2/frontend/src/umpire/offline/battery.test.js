import assert from 'node:assert/strict';
import test from 'node:test';
import { attachBattery, createBatteryMonitor, readBatterySnapshot } from './battery.js';

test('readBatterySnapshot converts Browser Battery API fraction to percent', () => {
  assert.deepEqual(readBatterySnapshot({ level: 0.65, charging: true }), { level: 65, charging: true });
  assert.deepEqual(readBatterySnapshot({ level: 1, charging: false }), { level: 100, charging: false });
  assert.deepEqual(readBatterySnapshot(null), { level: null, charging: null });
});

test('attachBattery fills admin fields without overwriting an existing payload', () => {
  const attached = attachBattery({ court_id: 't31-1' }, { level: 42, charging: true });
  assert.equal(attached.battery_level, 42);
  assert.equal(attached.is_charging, true);
  const kept = attachBattery({ battery_level: 9, is_charging: false }, { level: 80, charging: true });
  assert.equal(kept.battery_level, 9);
  assert.equal(kept.is_charging, false);
});

test('battery monitor stays empty without getBattery and updates from the API', async () => {
  const empty = createBatteryMonitor({ navigatorRef: {} });
  assert.deepEqual(empty.get(), { level: null, charging: null });

  const listeners = {};
  const battery = {
    level: 0.8,
    charging: false,
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
  };
  const monitor = createBatteryMonitor({
    navigatorRef: { getBattery: async () => battery },
  });
  await monitor.refresh();
  assert.deepEqual(monitor.get(), { level: 80, charging: false });
  battery.level = 0.2;
  battery.charging = true;
  listeners.levelchange();
  assert.deepEqual(monitor.get(), { level: 20, charging: true });
});

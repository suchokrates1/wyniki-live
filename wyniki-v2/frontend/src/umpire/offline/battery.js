export function readBatterySnapshot(battery) {
  if (!battery) return { level: null, charging: null };
  const raw = Number(battery.level);
  const level = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw * 100))) : null;
  return {
    level,
    charging: typeof battery.charging === 'boolean' ? battery.charging : null,
  };
}

export function attachBattery(payload, snapshot) {
  if (!payload || !snapshot) return payload;
  const next = { ...payload };
  if (snapshot.level != null && next.battery_level == null) next.battery_level = snapshot.level;
  if (snapshot.charging != null && next.is_charging == null) next.is_charging = snapshot.charging;
  return next;
}

export function createBatteryMonitor({ navigatorRef = globalThis.navigator } = {}) {
  let snapshot = { level: null, charging: null };
  let batteryRef = null;

  function apply(battery) {
    snapshot = readBatterySnapshot(battery);
    return snapshot;
  }

  async function refresh() {
    if (typeof navigatorRef?.getBattery !== 'function') return snapshot;
    try {
      if (!batteryRef) {
        batteryRef = await navigatorRef.getBattery();
        batteryRef.addEventListener?.('levelchange', () => apply(batteryRef));
        batteryRef.addEventListener?.('chargingchange', () => apply(batteryRef));
      }
      return apply(batteryRef);
    } catch {
      return snapshot;
    }
  }

  refresh();
  return {
    get() {
      return snapshot;
    },
    refresh,
  };
}

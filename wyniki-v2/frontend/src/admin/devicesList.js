/** Tablet rows: the new ones waiting for a name, then the named fleet. */

import { courtBattery } from './courtsList.js';

/** What the tablet is, as the API names it ("Teclast P50Ai_ROW"). */
export function deviceModel(row = {}) {
  return String(row.model || '').trim() || 'Nieznany model';
}

/** The line under the model: court, app version, when it was last seen. */
export function deviceMeta(row = {}, now = new Date()) {
  const parts = [];
  if (row.last_court_id) parts.push(`kort ${row.last_court_id}`);
  if (row.app_version) parts.push(row.app_version);
  const seen = row.last_seen ? new Date(row.last_seen) : null;
  if (seen && !Number.isNaN(seen.getTime())) {
    const minutes = Math.round((now.getTime() - seen.getTime()) / 60000);
    parts.push(minutes <= 1 ? 'widziany teraz' : minutes < 60 ? `widziany ${minutes} min temu` : seen.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
  }
  return parts.join(' · ');
}

export function createDevicesListView() {
  return {
    adminDeviceBuckets() {
      return [
        {
          id: 'new',
          title: 'Nowe',
          empty: 'Brak nowych. Tablet bez nazwy pojawi się tutaj po połączeniu.',
          rows: this.newDevices(),
        },
        {
          id: 'named',
          title: 'Nazwane',
          empty: 'Jeszcze żaden tablet nie ma nazwy.',
          rows: this.namedDevices(),
        },
      ];
    },

    adminDeviceMeta(row) {
      return deviceMeta(row);
    },

    adminDeviceModel(row) {
      return deviceModel(row);
    },

    adminDeviceBattery(row) {
      return courtBattery({ battery_level: row?.battery_level, is_charging: row?.is_charging });
    },
  };
}

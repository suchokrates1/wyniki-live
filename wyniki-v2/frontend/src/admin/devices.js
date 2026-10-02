/** Admin list of umpire tablets, with a per-tablet low-battery WhatsApp threshold. */
export function createDevicesAdmin() {
  return {
    devices: [],
    devicesError: '',

    async loadDevices() {
      this.devicesError = '';
      const response = await fetch('/admin/api/devices');
      if (!response.ok) {
        this.devicesError = 'Nie udało się wczytać tabletów.';
        return;
      }
      const data = await response.json();
      this.devices = (data.devices || []).map((row) => ({
        ...row,
        nameDraft: row.name || '',
        alertDraft: row.battery_alert_percent == null ? '' : String(row.battery_alert_percent),
      }));
    },

    deviceSeen(row) {
      if (!row.last_seen) return '';
      const date = new Date(row.last_seen);
      if (Number.isNaN(date.getTime())) return row.last_seen;
      return date.toLocaleString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    },

    deviceBattery(row) {
      if (row.battery_level == null) return '—';
      return `${row.battery_level}%${row.is_charging ? ' ⚡' : ''}`;
    },

    newDevices() {
      return this.devices.filter((row) => !String(row.name || '').trim());
    },

    namedDevices() {
      return this.devices.filter((row) => String(row.name || '').trim());
    },

    async saveDevice(row) {
      this.devicesError = '';
      const response = await fetch('/admin/api/devices/' + encodeURIComponent(row.android_id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.nameDraft,
          battery_alert_percent: row.alertDraft === '' ? null : Number(row.alertDraft),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.devicesError = data.error || 'Nie udało się zapisać.';
        return;
      }
      row.name = data.name || '';
      row.nameDraft = row.name;
      row.battery_alert_percent = data.battery_alert_percent;
      row.alertDraft = data.battery_alert_percent == null ? '' : String(data.battery_alert_percent);
    },
  };
}

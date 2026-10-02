/**
 * Module 30: umpire tablets.
 * A heartbeat shows up in the admin inventory. A device marked as a test
 * does not send a WhatsApp help request.
 */
import { adminHeaders, adminLogin, apiUrl } from '../fixtures.js';

export default async function run() {
  const token = await adminLogin();
  const androidId = `e2e${Date.now().toString(16)}`.slice(0, 16);

  const beat = await fetch(apiUrl('/api/umpire-heartbeat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TennisReferee-Android-Id': androidId,
      'X-TennisReferee-Manufacturer': 'E2E',
      'X-TennisReferee-Model': 'Tablet',
    },
    body: JSON.stringify({
      court_id: '',
      battery_level: 80,
      is_charging: false,
      app_version: 'e2e',
    }),
  });
  if (!beat.ok) throw new Error(`Heartbeat failed: ${beat.status}`);

  const listed = await fetch(apiUrl('/admin/api/devices'), { headers: adminHeaders(token) });
  if (!listed.ok) throw new Error(`Device list failed: ${listed.status}`);
  const devices = (await listed.json()).devices || [];
  if (!devices.some((row) => row.android_id === androidId)) {
    throw new Error('The heartbeat did not appear in the tablet inventory');
  }

  const savedResp = await fetch(apiUrl(`/admin/api/devices/${androidId}`), {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({ name: 'e2e', is_test: true, battery_alert_percent: 15 }),
  });
  const saved = await savedResp.json().catch(() => ({}));
  if (!savedResp.ok) throw new Error(`Device save failed: ${savedResp.status}`);
  if (saved.name !== 'e2e' || saved.is_test !== true || saved.battery_alert_percent !== 15) {
    throw new Error('The tablet name, test flag, or battery threshold did not stick');
  }

  const panicResp = await fetch(apiUrl('/api/umpire/panic'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TennisReferee-Android-Id': androidId,
      'X-TennisReferee-Model': 'Tablet',
    },
    body: JSON.stringify({ note: 'e2e silent' }),
  });
  const panic = await panicResp.json().catch(() => ({}));
  if (!panicResp.ok) throw new Error(`Test-device help request failed: ${panicResp.status} ${panic.error || ''}`);
  if (panic.sent !== 0) throw new Error(`A test device sent ${panic.sent} WhatsApp messages`);
  console.log('  Tablet inventory, test flag, and silent help request: OK');
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { changeWhat, changeWhen } from './changeLogView.js';

test('an admin change names its endpoint and address; an organizer change says where it came from', () => {
  assert.equal(changeWhat({ action: 'admin.admin_series.attach', detail: { method: 'PUT', path: '/admin/api/series/1/tournaments/28' } }),
    'admin_series.attach (PUT /admin/api/series/1/tournaments/28)');
  assert.equal(changeWhat({ action: 'court_pin', detail: {} }), 'panel organizatora: court_pin');
  assert.equal(changeWhen({ created_at: '2026-10-08T09:41:12Z' }), '2026-10-08 09:41');
});

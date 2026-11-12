import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRequestCarriesSession } from './auth.js';

test('the administrator session rides on admin calls and on reading one match', () => {
  assert.equal(adminRequestCarriesSession('/admin/api/courts'), true);
  assert.equal(adminRequestCarriesSession('/admin/api/auth', 'POST'), false);
  assert.equal(adminRequestCarriesSession('/api/overlay/settings', 'PUT'), true);
  assert.equal(adminRequestCarriesSession('/api/overlay/settings', 'GET'), false);
  assert.equal(adminRequestCarriesSession('/api/overlay/stats/key'), true);
  assert.equal(adminRequestCarriesSession('/api/matches/42'), true);
  assert.equal(adminRequestCarriesSession('/api/matches/42', 'PUT'), false);
  assert.equal(adminRequestCarriesSession('/api/matches'), false);
  assert.equal(adminRequestCarriesSession('/api/snapshot'), false);
});

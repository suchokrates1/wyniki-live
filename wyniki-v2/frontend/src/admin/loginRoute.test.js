import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLoginUrl, safeAdminNext } from './loginRoute.js';

test('back to the panel, the section included', () => {
  assert.equal(safeAdminNext('/admin#/players'), '/admin#/players');
  assert.equal(safeAdminNext('/admin.html#/courts'), '/admin.html#/courts');
  assert.equal(safeAdminNext('/admin/'), '/admin/');
});

test('never out of the panel, never back to the sign-in', () => {
  for (const next of ['', null, 'https://evil.example/admin', '//evil.example', '/office', '/administrator', '/admin/login', '/admin/login?next=/admin', '/admin\\@evil']) {
    assert.equal(safeAdminNext(next), '/admin', String(next));
  }
});

test('the sign-in address carries where to go and why', () => {
  assert.equal(adminLoginUrl(), '/admin/login');
  assert.equal(adminLoginUrl({ next: '/admin' }), '/admin/login');
  assert.equal(adminLoginUrl({ next: '/admin#/players', reason: 'expired' }), '/admin/login?next=%2Fadmin%23%2Fplayers&reason=expired');
  assert.equal(adminLoginUrl({ reason: 'out' }), '/admin/login?reason=out');
});

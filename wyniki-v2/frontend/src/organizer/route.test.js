import assert from 'node:assert/strict';
import test from 'node:test';
import { dateRange, organizerLoginUrl, safeOrganizerNext, tierLabel } from './route.js';

test('back into the panel, never out of it, never to the sign-in', () => {
  assert.equal(safeOrganizerNext('/organizer#/twt'), '/organizer#/twt');
  for (const next of ['', '/admin', 'https://evil.example/organizer', '//evil', '/organizer/login', '/organizer/invite?token=x', '/organizerx']) {
    assert.equal(safeOrganizerNext(next), '/organizer', next);
  }
});

test('the sign-in address carries where to go and why', () => {
  assert.equal(organizerLoginUrl(), '/organizer/login');
  assert.equal(organizerLoginUrl({ next: '/organizer#/twt', reason: 'expired' }), '/organizer/login?next=%2Forganizer%23%2Ftwt&reason=expired');
});

test('tiers read as the tour names them', () => {
  assert.equal(tierLabel('CH50'), 'Challenger 50');
  assert.equal(tierLabel('500'), '500');
  assert.equal(tierLabel(''), '');
});

test('dates as a range', () => {
  assert.equal(dateRange('2026-07-17', '2026-07-19'), '17–19.07.2026');
  assert.equal(dateRange('2026-06-30', '2026-07-02'), '30.06–02.07.2026');
  assert.equal(dateRange('2026-12-31', '2027-01-02'), '31.12.2026–02.01.2027');
  assert.equal(dateRange('2026-04-25', '2026-04-25'), '25.04.2026');
});

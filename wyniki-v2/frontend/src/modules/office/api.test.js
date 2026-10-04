import { strict as assert } from 'node:assert';
import test from 'node:test';

import { officeJson, officeResponse } from './api.js';

const view = () => ({
  slot: 3,
  officeHeaders: () => ({ Authorization: 'Bearer t' }),
  ot: (key) => `text:${key}`,
  logout() { this.loggedOut = true; },
});

const answer = (status, body) => async (url, init) => {
  answer.last = { url, init };
  return { ok: status < 400, status, json: async () => body };
};

test('a call goes to this slot with the token and the body as JSON', async () => {
  global.fetch = answer(200, { schedule: [] });
  const payload = await officeJson(view(), '/schedule/generate', { method: 'POST', body: { day_date: '2026-10-04' }, failure: 'errors.x' });
  assert.deepEqual(payload, { schedule: [] });
  assert.equal(answer.last.url, '/api/office/3/schedule/generate');
  assert.equal(answer.last.init.method, 'POST');
  assert.equal(answer.last.init.body, '{"day_date":"2026-10-04"}');
  assert.equal(answer.last.init.headers.Authorization, 'Bearer t');
});

test('a call with no body sends none', async () => {
  global.fetch = answer(200, {});
  await officeJson(view(), '/knockout-formats/confirm-all', { method: 'POST', failure: 'errors.x' });
  assert.equal('body' in answer.last.init, false);
});

test('an ended session stops the caller and leaves the logout to office.js', async () => {
  global.fetch = answer(401, { error: 'expired' });
  const office = view();
  assert.equal(await officeJson(office, '/dashboard', { failure: 'errors.x' }), null);
  assert.equal(await officeResponse(office, '/dashboard'), null);
  assert.equal(office.loggedOut, undefined, 'office.js may still follow the tournament to its new slot');
});

test('a refusal throws the server error, or the office text when the server gave none', async () => {
  global.fetch = answer(400, { error: 'label required' });
  await assert.rejects(officeJson(view(), '/categories', { failure: 'errors.categoriesFailed' }), /label required/);
  global.fetch = answer(500, {});
  await assert.rejects(officeJson(view(), '/categories', { failure: 'errors.categoriesFailed' }), /text:errors\.categoriesFailed/);
});

test('a caller that handles a refusal itself gets the status and the body', async () => {
  global.fetch = answer(409, { blocked_by: 'B1 — Finał' });
  assert.deepEqual(await officeResponse(view(), '/matches/7', { method: 'PUT', body: {} }), {
    ok: false, status: 409, payload: { blocked_by: 'B1 — Finał' },
  });
});

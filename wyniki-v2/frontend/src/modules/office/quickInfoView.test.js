import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createOfficeQuickInfoView } from './quickInfoView.js';

function officeStub(overrides = {}) {
  const view = createOfficeQuickInfoView();
  return Object.assign(view, {
    token: 'token',
    slot: 1,
    quickInfoMessage: '',
    quickInfoActive: true,
    quickInfoUpdatedAt: null,
    quickInfoDirty: false,
    quickInfoSaving: false,
    dashboardSeq: 0,
    toasts: [],
    officeHeaders: () => ({}),
    ot: (key) => key,
    showToast(message) { this.toasts.push(message); },
    logout() { this.loggedOut = true; },
    flushPendingOfficeRefresh() {},
    ...overrides,
  });
}

const respond = (quickInfo) => ({
  ok: true,
  status: 200,
  json: async () => ({ quick_info: quickInfo }),
});

test('a saved banner is applied when nobody typed while it was in flight', async () => {
  const office = officeStub({ quickInfoMessage: 'Kort 2 wolny od 15:00' });
  office.quickInfoDirty = true;
  global.fetch = async () => respond({ message: 'Kort 2 wolny od 15:00', active: true, updated_at: '2026-09-22T10:00:00Z' });

  await office.saveQuickInfo();

  assert.equal(office.quickInfoMessage, 'Kort 2 wolny od 15:00');
  assert.equal(office.quickInfoUpdatedAt, '2026-09-22T10:00:00Z');
  assert.equal(office.quickInfoDirty, false);
});

test('text typed while the save was in flight survives the response', async () => {
  const office = officeStub({ quickInfoMessage: 'Kort 2 wolny od 15:00' });
  office.quickInfoDirty = true;
  global.fetch = async () => {
    // the operator keeps typing before the server answers
    office.quickInfoMessage = 'Kort 2 wolny od 15:00 — zmiana';
    return respond({ message: 'Kort 2 wolny od 15:00', active: true, updated_at: '2026-09-22T10:00:00Z' });
  };

  await office.saveQuickInfo();

  assert.equal(office.quickInfoMessage, 'Kort 2 wolny od 15:00 — zmiana');
  assert.equal(office.quickInfoUpdatedAt, '2026-09-22T10:00:00Z');
  assert.equal(office.quickInfoDirty, true, 'the form still holds unsaved text');
});

test('hiding the banner saves the message as it stands', async () => {
  const office = officeStub({ quickInfoMessage: 'Kort 2 wolny', quickInfoActive: true });
  let sent = null;
  global.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return respond({ message: sent.message, active: sent.active, updated_at: '2026-09-22T11:00:00Z' });
  };

  await office.hideQuickInfo();

  assert.deepEqual(sent, { message: 'Kort 2 wolny', active: false });
  assert.equal(office.quickInfoActive, false);
  assert.equal(office.quickInfoDirty, false);
});

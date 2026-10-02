import assert from 'node:assert/strict';
import test from 'node:test';

import { createCourtPinsView, isWeakPin, pinProposals, randomPin } from './courtPins.js';

const courts = [
  { kort_id: 't32-1', name: '1', pin: '0000', tournament_id: 32 },
  { kort_id: 't32-2', name: '2', pin: '0000', tournament_id: 32 },
  { kort_id: 't31-1', name: '1', pin: '8261', tournament_id: 31 },
];

test('the PINs anyone would try count as weak, and so does anything that is not four digits', () => {
  for (const pin of ['0000', '1234', '4242', '9999']) assert.equal(isWeakPin(pin), true, pin);
  assert.equal(isWeakPin('8261'), false);
  assert.equal(isWeakPin(''), true);
  assert.equal(isWeakPin('123'), true);
  assert.equal(isWeakPin('abcd'), true);
});

test('a drawn PIN is four digits and never one of the obvious ones', () => {
  let calls = 0;
  const rigged = () => { calls += 1; return calls === 1 ? 0 : 0.8261; }; // first draw lands on 0000
  const pin = randomPin(rigged);
  assert.equal(pin, '8261');
  for (let i = 0; i < 200; i += 1) assert.equal(isWeakPin(randomPin()), false);
});

test('every court gets its own PIN, with the old one shown next to it', () => {
  const proposals = pinProposals(courts);
  assert.equal(proposals.length, 3);
  assert.equal(new Set(proposals.map((p) => p.pin)).size, 3);
  assert.deepEqual(proposals.map((p) => p.was), ['0000', '0000', '8261']);
  assert.deepEqual(proposals.map((p) => p.wasWeak), [true, true, false]);
});

test('the banner counts the courts that still carry a guessable PIN', () => {
  const view = Object.assign({ courts, selectedCourtTournamentIds: [] }, createCourtPinsView());
  assert.deepEqual(view.adminWeakPinCourts().map((c) => c.kort_id), ['t32-1', 't32-2']);
});

test('the dialog draws PINs for the courts in view, and re-drawing changes them', () => {
  const view = Object.assign({ courts, selectedCourtTournamentIds: ['32'] }, createCourtPinsView());
  view.openPinDialog();
  assert.equal(view.pinDialogOpen, true);
  assert.deepEqual(view.pinProposals.map((p) => p.kort_id), ['t32-1', 't32-2']);
  const first = view.pinProposals.map((p) => p.pin).join();
  let changed = false;
  for (let i = 0; i < 5 && !changed; i += 1) {
    view.rerollPins();
    changed = view.pinProposals.map((p) => p.pin).join() !== first;
  }
  assert.ok(changed, 'a re-draw gives different PINs');
});

test('saving sends one PIN per court and then closes', async () => {
  const sent = [];
  const view = Object.assign({
    courts,
    selectedCourtTournamentIds: [],
    updateCourtPin: async (kortId, pin) => { sent.push([kortId, pin]); },
  }, createCourtPinsView());
  view.openPinDialog();
  await view.savePinProposals();
  assert.deepEqual(sent.map(([kortId]) => kortId), ['t32-1', 't32-2', 't31-1']);
  assert.ok(sent.every(([, pin]) => /^\d{4}$/.test(pin)));
  assert.equal(view.pinDialogOpen, false);
});

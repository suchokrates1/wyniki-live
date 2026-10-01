import assert from 'node:assert/strict';
import test from 'node:test';
import { courtsFromSnapshot, createPwaPushData } from './pwaShellView.js';

// Alpine's merged scope writes a property onto the first object that already
// owns it, and onto the outermost component otherwise. A field invented inside
// init() therefore leaves the bell, and Zapisz subscribes with an empty key.
function writeLikeAlpine(component, parent, name, value) {
  const objects = [{}, component, parent];
  const target = objects.find((obj) => Object.prototype.hasOwnProperty.call(obj, name)) || objects.at(-1);
  target[name] = value;
}

test('courts from the snapshot keep the number the public site shows', () => {
  const courts = courtsFromSnapshot({
    courts: {
      't32-3': { court_name: '3', display_order: 3 },
      't32-1': { court_name: '1', display_order: 1 },
      't32-2': { court_name: '2', display_order: 2 },
    },
  });
  assert.deepEqual(courts.map((court) => court.label), ['1', '2', '3']);
  assert.equal(courts[0].id, 't32-1');
});

test('a snapshot without courts is an empty picker', () => {
  assert.deepEqual(courtsFromSnapshot(null), []);
  assert.deepEqual(courtsFromSnapshot({ courts: [] }), []);
});

test('the bell keeps the push key it learns at startup', () => {
  const component = createPwaPushData();
  const parent = {};
  writeLikeAlpine(component, parent, 'pushKey', 'vapid-public');
  writeLikeAlpine(component, parent, 'pushRegistration', { pushManager: {} });
  writeLikeAlpine(component, parent, 'langObserver', { disconnect() {} });
  assert.equal(component.pushKey, 'vapid-public');
  assert.ok(component.pushRegistration.pushManager);
  assert.equal(typeof component.langObserver.disconnect, 'function');
  assert.equal(parent.pushKey, undefined);
  assert.equal(parent.pushRegistration, undefined);
});

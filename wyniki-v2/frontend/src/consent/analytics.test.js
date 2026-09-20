import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANALYTICS_CONSENT_KEY,
  UMAMI_WEBSITE_ID,
  applyAnalyticsConsent,
  hasUmamiScript,
  loadUmami,
  loadUmamiIfAllowed,
  readAnalyticsConsent,
} from './analytics.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function fakeDocument() {
  const scripts = [];
  const documentRef = {
    scripts,
    head: {
      appendChild(node) {
        scripts.push(node);
      },
    },
    createElement(name) {
      assert.equal(name, 'script');
      const attrs = {};
      return {
        defer: false,
        src: '',
        setAttribute(key, value) {
          attrs[key] = value;
        },
        getAttribute(key) {
          return attrs[key];
        },
      };
    },
    querySelector(selector) {
      if (selector !== `script[data-website-id="${UMAMI_WEBSITE_ID}"]`) return null;
      return scripts.find((script) => script.getAttribute('data-website-id') === UMAMI_WEBSITE_ID) || null;
    },
  };
  return documentRef;
}

test('consent is unread until the visitor chooses', () => {
  assert.equal(readAnalyticsConsent(memoryStorage()), null);
});

test('reject stores the choice and does not load Umami', () => {
  const storage = memoryStorage();
  const documentRef = fakeDocument();
  applyAnalyticsConsent('rejected', { storage, documentRef });
  assert.equal(readAnalyticsConsent(storage), 'rejected');
  assert.equal(hasUmamiScript(documentRef), false);
});

test('accept stores the choice and injects Umami once', () => {
  const storage = memoryStorage();
  const documentRef = fakeDocument();
  applyAnalyticsConsent('accepted', { storage, documentRef });
  applyAnalyticsConsent('accepted', { storage, documentRef });
  assert.equal(readAnalyticsConsent(storage), 'accepted');
  assert.equal(documentRef.scripts.length, 1);
  assert.equal(documentRef.scripts[0].getAttribute('data-website-id'), UMAMI_WEBSITE_ID);
});

test('loadUmamiIfAllowed stays off without consent', () => {
  const storage = memoryStorage();
  const documentRef = fakeDocument();
  assert.equal(loadUmamiIfAllowed({ storage, documentRef }), false);
  assert.equal(loadUmami({ documentRef }), true);
  assert.equal(storage.getItem(ANALYTICS_CONSENT_KEY), null);
});

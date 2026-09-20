import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privacyHref } from './privacyHref.js';

test('privacyHref keeps a real /privacy URL and optional hash', () => {
  assert.equal(privacyHref('pl'), '/privacy?lang=pl');
  assert.equal(privacyHref('en', 'analityka'), '/privacy?lang=en#analityka');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { umpireClientHeaders } from './clientHeaders.js';

test('PWA client headers match Android X-TennisReferee names', () => {
  const headers = umpireClientHeaders({
    appVersion: '2.0.0',
    locale: 'pl-PL',
    navigatorRef: {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-X200) AppleWebKit/537.36',
      language: 'pl-PL',
    },
  });
  assert.equal(headers['X-TennisReferee-Platform'], 'pwa');
  assert.equal(headers['X-TennisReferee-App-Version'], '2.0.0');
  assert.equal(headers['X-TennisReferee-Device'], 'SM-X200');
  assert.equal(headers['X-TennisReferee-Locale'], 'pl-PL');
  assert.equal(headers['X-TennisReferee-Country'], 'PL');
  assert.ok(headers['X-TennisReferee-Timezone']);
});

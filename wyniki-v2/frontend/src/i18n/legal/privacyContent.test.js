import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUPPORTED_LANGUAGES } from '../locale.js';
import {
  PRIVACY_SECTION_IDS,
  getPrivacyContent,
  privacySectionIds,
} from './privacyContent.js';

function collectEmpty(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectEmpty(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => (
      collectEmpty(child, prefix ? `${prefix}.${key}` : key)
    ));
  }
  return typeof value === 'string' && !value.trim() ? [prefix] : [];
}

test('every language has the same privacy section ids', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.deepEqual(privacySectionIds(lang), [...PRIVACY_SECTION_IDS], lang);
  }
});

test('privacy content has no empty strings', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const empty = collectEmpty(getPrivacyContent(lang));
    assert.deepEqual(empty, [], lang);
  }
});

test('cookie section keeps the analityka anchor', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const cookies = getPrivacyContent(lang).sections.find((item) => item.id === 'analityka');
    assert.ok(cookies, lang);
    assert.ok(cookies.heading);
    assert.ok(cookies.paragraphs.some((paragraph) => /stats\.dawidsuchodolski\.pl/i.test(paragraph)), lang);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { doorLinks, pickPanelLanguage } from './doors.js';
import { PANEL_TEXTS } from './texts.js';

test('the page takes ?lang=, then the site’s saved choice, then the browser, then English', () => {
  assert.equal(pickPanelLanguage('?lang=de', 'pl', ['fr']), 'de');
  assert.equal(pickPanelLanguage('?lang=xx', 'pl', ['fr']), 'pl');
  assert.equal(pickPanelLanguage('', '', ['fr-FR', 'en']), 'fr');
  assert.equal(pickPanelLanguage('', 'zz', ['ja']), 'en');
});

test('every door keeps the language, and every language has every text', () => {
  assert.deepEqual(doorLinks('lt'), {
    panelOffice: '/office?lang=lt', panelOrganizer: '/organizer/login?lang=lt',
    panelBack: '/?lang=lt', panelHome: '/?lang=lt', panelPrivacy: '/privacy?lang=lt',
  });
  const keys = Object.keys(PANEL_TEXTS.pl).sort();
  for (const [lang, texts] of Object.entries(PANEL_TEXTS)) {
    assert.deepEqual(Object.keys(texts).sort(), keys, lang);
    for (const [key, value] of Object.entries(texts)) assert.ok(value.trim(), `${lang}.${key}`);
  }
});
